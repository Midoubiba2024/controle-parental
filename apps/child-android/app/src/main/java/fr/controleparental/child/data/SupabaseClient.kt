package fr.controleparental.child.data

import fr.controleparental.child.Config
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * Client minimal pour remonter les AGRÉGATS L1 vers Supabase (PostgREST), sous
 * la session du compte « enfant ». Gère le rafraîchissement du jeton d'accès.
 *
 * On ne transmet JAMAIS de contenu : uniquement des métadonnées / agrégats
 * (temps d'écran par app, inventaire, batterie/stockage, métadonnées d'appels).
 */
class SupabaseClient(private val store: SupervisionStore) {

    private val http = OkHttpClient()
    private val jsonType = "application/json".toMediaType()

    sealed interface Result {
        data object Ok : Result
        data class Error(val code: String) : Result
    }

    /**
     * Upsert d'un lot de lignes dans [table]. [onConflict] = colonnes de la
     * contrainte d'unicité (merge) ; null = simple insert. Rafraîchit la session
     * et rejoue une fois en cas de 401.
     */
    suspend fun upsert(
        table: String,
        rows: JSONArray,
        onConflict: String? = null,
        ignoreDuplicates: Boolean = false,
    ): Result = withContext(Dispatchers.IO) {
        if (rows.length() == 0) return@withContext Result.Ok
        val enrollment = store.load() ?: return@withContext Result.Error("not_enrolled")

        var token = enrollment.accessToken
        var attempt = 0
        while (true) {
            attempt++
            val resp = post(table, rows, onConflict, ignoreDuplicates, token)
            when {
                resp == 401 && attempt == 1 -> {
                    when (val r = refresh()) {
                        is RefreshResult.Ok -> token = r.accessToken
                        is RefreshResult.Error -> return@withContext Result.Error("refresh_${r.code}")
                    }
                }
                resp in 200..299 -> return@withContext Result.Ok
                else -> return@withContext Result.Error("http_$resp")
            }
        }
    }

    /**
     * PATCH (UPDATE) ciblé par un filtre PostgREST ([query], ex.
     * "child_id=eq.…&removed_at=is.null"). Applique [patch] aux lignes filtrées.
     * Même logique de rafraîchissement de session que [upsert]. Retourne Ok si
     * aucune ligne ne correspond (204).
     */
    suspend fun patch(
        table: String,
        query: String,
        patch: JSONObject,
    ): Result = withContext(Dispatchers.IO) {
        val enrollment = store.load() ?: return@withContext Result.Error("not_enrolled")

        var token = enrollment.accessToken
        var attempt = 0
        while (true) {
            attempt++
            val resp = patchRequest(table, query, patch, token)
            when {
                resp == 401 && attempt == 1 -> {
                    when (val r = refresh()) {
                        is RefreshResult.Ok -> token = r.accessToken
                        is RefreshResult.Error -> return@withContext Result.Error("refresh_${r.code}")
                    }
                }
                resp in 200..299 -> return@withContext Result.Ok
                else -> return@withContext Result.Error("http_$resp")
            }
        }
    }

    private fun patchRequest(
        table: String,
        query: String,
        patch: JSONObject,
        accessToken: String,
    ): Int {
        val url = Config.restUrl(table) + "?" + query
        val req = Request.Builder()
            .url(url)
            .addHeader("apikey", Config.supabaseAnonKey)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "return=minimal")
            .patch(patch.toString().toRequestBody(jsonType))
            .build()
        return try {
            http.newCall(req).execute().use { it.code }
        } catch (_: Exception) {
            0
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

    private sealed interface RefreshResult {
        data class Ok(val accessToken: String) : RefreshResult
        data class Error(val code: String) : RefreshResult
    }

    private fun refresh(): RefreshResult {
        val enrollment = store.load() ?: return RefreshResult.Error("not_enrolled")
        val body = JSONObject().put("refresh_token", enrollment.refreshToken)
            .toString().toRequestBody(jsonType)
        val req = Request.Builder()
            .url(Config.tokenRefreshUrl)
            .addHeader("apikey", Config.supabaseAnonKey)
            .addHeader("Content-Type", "application/json")
            .post(body)
            .build()
        return try {
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) return RefreshResult.Error("http_${resp.code}")
                val obj = JSONObject(text)
                val access = obj.getString("access_token")
                val refresh = obj.optString("refresh_token", enrollment.refreshToken)
                store.updateTokens(access, refresh)
                RefreshResult.Ok(access)
            }
        } catch (e: Exception) {
            RefreshResult.Error(e.message ?: "network_error")
        }
    }
}
