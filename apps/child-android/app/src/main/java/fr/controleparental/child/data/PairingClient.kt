package fr.controleparental.child.data

import android.os.Build
import fr.controleparental.child.Config
import fr.controleparental.child.pairing.AuthSession
import fr.controleparental.child.pairing.PairingCode
import fr.controleparental.child.pairing.PairingProtocol
import fr.controleparental.child.pairing.RpcOutcome
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Appairage de l'appareil (LOT 12, contrat docs/14-APPAIRAGE.md) :
 *  1. session ANONYME Supabase (créée une fois, réutilisée pour les essais
 *     suivants, rafraîchie si besoin) ;
 *  2. RPC PostgREST `pairing_complete(p_code, p_device)` avec le jeton de cette
 *     session ;
 *  3. succès → la session anonyme devient la session de l'appareil.
 *
 * Aucun secret : seule la clé PUBLIABLE est embarquée. Aucune collecte nouvelle
 * (`p_device` = plateforme, modèle, version d'Android, libellé).
 * 🔴 Ni le code ni les jetons ne sont journalisés.
 */
class PairingClient(private val store: SupervisionStore) {

    private val http = Http.client
    private val jsonType = "application/json".toMediaType()

    sealed interface Result {
        data class Ok(val enrollment: SupervisionStore.Enrollment) : Result
        /** [retryAfterSeconds] : renseigné pour `too_many_attempts`. */
        data class Error(val code: String, val retryAfterSeconds: Int? = null) : Result
    }

    /** [code] : saisie de l'enfant (normalisée ici ; le serveur reste l'arbitre). */
    suspend fun complete(code: String): Result = withContext(Dispatchers.IO) {
        // Jamais deux appels en parallèle (double clic) : verrou de processus.
        mutex.withLock { completeLocked(PairingCode.normalize(code)) }
    }

    private fun completeLocked(code: String): Result {
        // Attente imposée par le serveur encore en cours : ne rien envoyer.
        val blockedMs = store.pairingBlockedUntil - System.currentTimeMillis()
        if (blockedMs > 0) return Result.Error("too_many_attempts", ((blockedMs + 999) / 1000).toInt())

        var session = when (val s = pendingSession()) {
            is AuthClient.Result.Ok -> s.session
            AuthClient.Result.Lost -> return Result.Error("session_lost")
            is AuthClient.Result.Error -> return Result.Error(s.code)
        }
        // UN SEUL rejeu, quelle qu'en soit la cause (401, session refusée…) :
        // jamais de boucle de requêtes.
        var replayed = false
        while (true) {
            val outcome = callRpc(code, session.accessToken)
            if (outcome is RpcOutcome.Paired) return succeed(outcome, session)
            outcome as RpcOutcome.Failed
            val next: AuthClient.Result? = when (outcome.code) {
                // §3 — session refusée par le serveur : la jeter, en ouvrir une NOUVELLE.
                "device_already_paired", "anonymous_session_required", "parent_account_forbidden" ->
                    if (replayed) null else freshSession()
                // §3 — jeton sans utilisateur / 401 PostgREST : rafraîchir, sinon nouvelle session.
                "not_authenticated", HTTP_401 ->
                    if (replayed) null else refreshPending(session).let {
                        if (it == AuthClient.Result.Lost) freshSession() else it
                    }
                else -> null
            }
            if (next !is AuthClient.Result.Ok) {
                if (outcome.code == "too_many_attempts") {
                    // Bouton désactivé pendant l'attente ; surtout PAS de nouvelle session.
                    val wait = (outcome.retryAfterSeconds ?: DEFAULT_RETRY_SECONDS).toLong()
                    store.pairingBlockedUntil = System.currentTimeMillis() + wait * 1000
                }
                return when (next) {
                    is AuthClient.Result.Error -> Result.Error(next.code)
                    else -> Result.Error(outcome.code, outcome.retryAfterSeconds)
                }
            }
            session = next.session
            replayed = true
        }
    }

    /** §5 — session anonyme EN ATTENTE : réutilisée, rafraîchie si elle expire. */
    private fun pendingSession(): AuthClient.Result {
        val pending = store.loadPendingSession() ?: return freshSession()
        if (!AuthClient.expiresSoon(pending.expiresAt, pending.obtainedAt)) return AuthClient.Result.Ok(pending)
        return when (val r = refreshPending(pending)) {
            // Session en attente perdue (compte anonyme purgé) : on en ouvre une autre.
            AuthClient.Result.Lost -> freshSession()
            else -> r
        }
    }

    /** §4 — rotation : le nouveau refresh token est écrit avant tout usage. */
    private fun refreshPending(s: AuthSession): AuthClient.Result {
        val r = AuthClient.refresh(s.refreshToken)
        when (r) {
            is AuthClient.Result.Ok -> store.savePendingSession(r.session)
            AuthClient.Result.Lost -> store.clearPendingSession()
            is AuthClient.Result.Error -> Unit
        }
        return r
    }

    /** §2 — nouvelle session anonyme (l'ancienne est jetée, jamais réutilisée). */
    private fun freshSession(): AuthClient.Result {
        store.clearPendingSession()
        val r = AuthClient.signUpAnonymous()
        if (r is AuthClient.Result.Ok) store.savePendingSession(r.session)
        return r
    }

    private fun succeed(p: RpcOutcome.Paired, s: AuthSession): Result {
        val enrollment = SupervisionStore.Enrollment(
            deviceId = p.deviceId,
            familyId = p.familyId,
            childId = p.childId,
            mode = p.mode,
            accessToken = s.accessToken,
            refreshToken = s.refreshToken,
            expiresAt = s.expiresAt,
            obtainedAt = s.obtainedAt,
        )
        store.completeEnrollment(enrollment)
        return Result.Ok(enrollment)
    }

    /** §3 — RPC `pairing_complete` ; erreurs HTTP converties en `http_<code>`. */
    private fun callRpc(code: String, accessToken: String): RpcOutcome {
        val device = JSONObject()
            .put("platform", "android")
            .put("model", Build.MANUFACTURER + " " + Build.MODEL)
            .put("os_version", "Android " + Build.VERSION.RELEASE)
            .put("label", Build.MODEL)
        val body = JSONObject()
            .put("p_code", code)
            .put("p_device", device)
            .toString()
            .toRequestBody(jsonType)
        val req = Request.Builder()
            .url(Config.pairingCompleteRpcUrl)
            .addHeader("apikey", Config.supabaseAnonKey)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Content-Type", "application/json")
            .addHeader("Accept", "application/json")
            .post(body)
            .build()
        return try {
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (resp.isSuccessful) PairingProtocol.parseRpc(text)
                else RpcOutcome.Failed("http_${resp.code}")
            }
        } catch (_: Exception) {
            // Réseau / délai : la même session sera réutilisée au prochain essai (idempotent).
            RpcOutcome.Failed(PairingProtocol.NETWORK_ERROR)
        }
    }

    private companion object {
        val mutex = Mutex()
        const val HTTP_401 = "http_401"
        /** Repli si `retry_after_seconds` manquait (le serveur le fournit toujours). */
        const val DEFAULT_RETRY_SECONDS = 60
    }
}
