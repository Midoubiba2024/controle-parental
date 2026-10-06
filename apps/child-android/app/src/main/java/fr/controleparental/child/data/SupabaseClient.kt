package fr.controleparental.child.data

import fr.controleparental.child.Config
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * Client minimal pour remonter les AGRÉGATS L1 vers Supabase (PostgREST), sous
 * la session de l'APPAREIL (session anonyme appairée, LOT 12). Gère le
 * rafraîchissement du jeton (rotation stricte, un seul à la fois, proactif à
 * moins de 60 s de l'expiration et sur tout 401) et détecte la perte de session
 * ou le retrait de l'appareil par le parent (docs/14-APPAIRAGE.md §4–§5) : dans
 * les deux cas l'enrôlement local est effacé et l'appli revient à l'appairage.
 *
 * On ne transmet JAMAIS de contenu : uniquement des métadonnées / agrégats
 * (temps d'écran par app, inventaire, batterie/stockage, métadonnées d'appels).
 */
class SupabaseClient(private val store: SupervisionStore) {

    private val http = Http.client
    private val jsonType = "application/json".toMediaType()

    sealed interface Result {
        data object Ok : Result
        data class Error(val code: String) : Result
    }

    sealed interface GetResult {
        data class Ok(val body: String) : GetResult
        data class Error(val code: String) : GetResult
    }

    /**
     * SELECT (GET) PostgREST avec un filtre ([query], ex.
     * "child_id=eq.…&select=*"). Rafraîchit la session et rejoue une fois sur 401.
     * Utilisé pour récupérer les RÈGLES et les COMMANDES (LOT 2).
     */
    suspend fun get(table: String, query: String): GetResult = withContext(Dispatchers.IO) {
        var token = when (val t = accessToken()) {
            is Token.Ok -> t.value
            is Token.Error -> return@withContext GetResult.Error(t.code)
        }
        // 2 tentatives max : la 2e (après rafraîchissement sur 401) retourne toujours.
        for (attempt in 1..2) {
            val (code, body) = getRequest(table, query, token)
            when {
                code == 401 && attempt == 1 -> {
                    when (val r = refreshAfter(token)) {
                        is Token.Ok -> token = r.value
                        is Token.Error -> return@withContext GetResult.Error("refresh_${r.code}")
                    }
                }
                code in 200..299 -> return@withContext GetResult.Ok(body)
                else -> return@withContext GetResult.Error("http_$code")
            }
        }
        GetResult.Error("http_401")
    }

    private fun getRequest(table: String, query: String, accessToken: String): Pair<Int, String> {
        val url = Config.restUrl(table) + "?" + query
        val req = Request.Builder()
            .url(url)
            .addHeader("apikey", Config.supabaseAnonKey)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Accept", "application/json")
            .get()
            .build()
        return try {
            http.newCall(req).execute().use { it.code to (it.body?.string().orEmpty()) }
        } catch (_: Exception) {
            0 to ""
        }
    }

    /**
     * Upsert d'un lot de lignes dans [table]. [onConflict] = colonnes de la
     * contrainte d'unicité (merge) ; null = simple insert. Rafraîchit la session
     * et rejoue une fois en cas de 401. Un 403 (RLS, clause WITH CHECK) peut
     * signifier que l'appareil a été retiré : on le vérifie (§5).
     */
    suspend fun upsert(
        table: String,
        rows: JSONArray,
        onConflict: String? = null,
        ignoreDuplicates: Boolean = false,
    ): Result = withContext(Dispatchers.IO) {
        if (rows.length() == 0) return@withContext Result.Ok
        var token = when (val t = accessToken()) {
            is Token.Ok -> t.value
            is Token.Error -> return@withContext Result.Error(t.code)
        }
        // 2 tentatives max : la 2e (après rafraîchissement sur 401) retourne toujours.
        for (attempt in 1..2) {
            val resp = post(table, rows, onConflict, ignoreDuplicates, token)
            when {
                resp == 401 && attempt == 1 -> {
                    when (val r = refreshAfter(token)) {
                        is Token.Ok -> token = r.value
                        is Token.Error -> return@withContext Result.Error("refresh_${r.code}")
                    }
                }
                resp in 200..299 -> return@withContext Result.Ok
                else -> {
                    if (resp == 403) verifyDeviceActive()
                    return@withContext Result.Error("http_$resp")
                }
            }
        }
        Result.Error("http_401")
    }

    /**
     * PATCH (UPDATE) ciblé par un filtre PostgREST ([query], ex.
     * "child_id=eq.…&removed_at=is.null"). Applique [patch] aux lignes filtrées.
     * Même logique de rafraîchissement de session que [upsert]. Retourne Ok si
     * aucune ligne ne correspond — mais un PATCH sans effet est aussi le seul
     * symptôme d'un appareil retiré (clause USING) : on le vérifie alors (§5).
     */
    suspend fun patch(
        table: String,
        query: String,
        patch: JSONObject,
    ): Result = withContext(Dispatchers.IO) {
        var token = when (val t = accessToken()) {
            is Token.Ok -> t.value
            is Token.Error -> return@withContext Result.Error(t.code)
        }
        // 2 tentatives max : la 2e (après rafraîchissement sur 401) retourne toujours.
        for (attempt in 1..2) {
            val (resp, affected) = patchRequest(table, query, patch, token)
            when {
                resp == 401 && attempt == 1 -> {
                    when (val r = refreshAfter(token)) {
                        is Token.Ok -> token = r.value
                        is Token.Error -> return@withContext Result.Error("refresh_${r.code}")
                    }
                }
                resp in 200..299 -> {
                    if (affected == 0) verifyDeviceActive()
                    return@withContext Result.Ok
                }
                else -> return@withContext Result.Error("http_$resp")
            }
        }
        Result.Error("http_401")
    }

    /** Code HTTP + nombre de lignes modifiées (total de l'en-tête Content-Range ; null = inconnu). */
    private fun patchRequest(
        table: String,
        query: String,
        patch: JSONObject,
        accessToken: String,
    ): Pair<Int, Int?> {
        val url = Config.restUrl(table) + "?" + query
        val req = Request.Builder()
            .url(url)
            .addHeader("apikey", Config.supabaseAnonKey)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "return=minimal,count=exact")
            .patch(patch.toString().toRequestBody(jsonType))
            .build()
        return try {
            http.newCall(req).execute().use { resp ->
                val total = resp.header("Content-Range")?.substringAfterLast('/')?.toIntOrNull()
                resp.code to total
            }
        } catch (_: Exception) {
            0 to null
        }
    }

    private fun post(
        table: String,
        rows: JSONArray,
        onConflict: String?,
        ignoreDuplicates: Boolean,
        accessToken: String,
    ): Int {
        val url = buildString {
            append(Config.restUrl(table))
            if (onConflict != null) append("?on_conflict=").append(onConflict)
        }
        val prefer = when {
            onConflict != null && ignoreDuplicates -> "resolution=ignore-duplicates,return=minimal"
            onConflict != null -> "resolution=merge-duplicates,return=minimal"
            else -> "return=minimal"
        }
        val req = Request.Builder()
            .url(url)
            .addHeader("apikey", Config.supabaseAnonKey)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", prefer)
            .post(rows.toString().toRequestBody(jsonType))
            .build()
        return try {
            http.newCall(req).execute().use { it.code }
        } catch (_: Exception) {
            0
        }
    }

    // --- Session de l'appareil (§4) ------------------------------------------

    private sealed interface Token {
        data class Ok(val value: String) : Token
        data class Error(val code: String) : Token
    }

    /** Jeton courant, rafraîchi d'abord s'il expire dans moins de 60 s. */
    private suspend fun accessToken(): Token {
        val e = store.load() ?: return Token.Error("not_enrolled")
        return if (AuthClient.expiresSoon(e.expiresAt, e.obtainedAt)) refreshAfter(e.accessToken) else Token.Ok(e.accessToken)
    }

    /**
     * Rafraîchit la session après l'échec (ou l'expiration proche) de [staleToken].
     * UN SEUL rafraîchissement à la fois dans le processus (mutex) : si un autre
     * appelant l'a déjà fait, on reprend son jeton au lieu de réutiliser le même
     * refresh token (réutilisation = session invalidée côté serveur).
     */
    private suspend fun refreshAfter(staleToken: String): Token = refreshMutex.withLock {
        val e = store.load() ?: return@withLock Token.Error("not_enrolled")
        if (e.accessToken != staleToken && !AuthClient.expiresSoon(e.expiresAt, e.obtainedAt)) {
            return@withLock Token.Ok(e.accessToken)
        }
        when (val r = AuthClient.refresh(e.refreshToken)) {
            is AuthClient.Result.Ok -> {
                // Nouveau refresh token écrit (commit) AVANT tout usage de l'access token.
                store.updateTokens(r.session)
                Token.Ok(r.session.accessToken)
            }
            AuthClient.Result.Lost -> {
                store.unenroll(SupervisionStore.UnenrollReason.SESSION_LOST)
                Token.Error("session_lost")
            }
            is AuthClient.Result.Error -> Token.Error(r.code)
        }
    }

    // --- Retrait de l'appareil par le parent (§5) ------------------------------

    enum class DeviceState { ACTIVE, REVOKED, UNKNOWN }

    /**
     * Vérifie que l'appareil est toujours actif : `devices?id=eq.<id>` lu avec le
     * jeton de l'appareil. Tableau VIDE (ou `revoked_at` renseigné) = appareil
     * retiré → enrôlement et session effacés, retour à l'écran d'appairage. Une
     * erreur réseau n'est JAMAIS prise pour un retrait (UNKNOWN). Hors [force],
     * au plus une vérification par minute : aucune boucle de requêtes.
     */
    suspend fun verifyDeviceActive(force: Boolean = false): DeviceState = withContext(Dispatchers.IO) {
        val e = store.load() ?: return@withContext DeviceState.UNKNOWN
        val now = System.currentTimeMillis()
        if (!force && now - lastDeviceCheckMs < DEVICE_CHECK_MIN_INTERVAL_MS) {
            return@withContext DeviceState.UNKNOWN
        }
        lastDeviceCheckMs = now
        val body = when (val r = get("devices", "id=eq.${e.deviceId}&select=id,revoked_at")) {
            is GetResult.Ok -> r.body
            is GetResult.Error -> return@withContext DeviceState.UNKNOWN
        }
        val rows = runCatching { JSONArray(body) }.getOrNull() ?: return@withContext DeviceState.UNKNOWN
        val revoked = rows.length() == 0 ||
            rows.optJSONObject(0)?.let { !it.isNull("revoked_at") } == true
        if (!revoked) return@withContext DeviceState.ACTIVE
        // Ne pas effacer un NOUVEL enrôlement survenu pendant la vérification.
        if (store.load()?.deviceId == e.deviceId) {
            store.unenroll(SupervisionStore.UnenrollReason.DEVICE_REVOKED)
        }
        DeviceState.REVOKED
    }

    private companion object {
        /** Partagé par toutes les instances (workers, service, écrans) du processus. */
        val refreshMutex = Mutex()

        @Volatile var lastDeviceCheckMs = 0L
        const val DEVICE_CHECK_MIN_INTERVAL_MS = 60_000L
    }
}
