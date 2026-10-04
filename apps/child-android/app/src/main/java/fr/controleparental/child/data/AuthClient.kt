package fr.controleparental.child.data

import fr.controleparental.child.Config
import fr.controleparental.child.pairing.AuthSession
import fr.controleparental.child.pairing.PairingProtocol
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Appels GoTrue (Supabase Auth) de l'appareil — docs/14-APPAIRAGE.md §2 et §4.
 * Seule la clé PUBLIABLE est envoyée (en-tête `apikey`) : jamais de clé de
 * service, jamais d'e-mail ni de mot de passe. Appels BLOQUANTS : à exécuter
 * sur Dispatchers.IO.
 *
 * 🔴 Ne jamais journaliser les jetons ni les corps de réponse.
 */
object AuthClient {

    private val http = Http.client
    private val jsonType = "application/json".toMediaType()

    sealed interface Result {
        data class Ok(val session: AuthSession) : Result
        /** Refresh token définitivement inutilisable (§4) : session perdue. */
        data object Lost : Result
        data class Error(val code: String) : Result
    }

    /** §2 — Inscription ANONYME : corps `{}`, aucune donnée, pas de CAPTCHA. */
    fun signUpAnonymous(): Result = call(Config.anonymousSignupUrl, JSONObject())

    /** §4 — Rafraîchissement (refresh token à usage unique : rotation). */
    fun refresh(refreshToken: String): Result =
        call(Config.tokenRefreshUrl, JSONObject().put("refresh_token", refreshToken))

    private fun call(url: String, body: JSONObject): Result {
        // Pas d'en-tête Authorization : la clé publiable n'est pas un JWT, `apikey` suffit.
        val req = Request.Builder()
            .url(url)
            .addHeader("apikey", Config.supabaseAnonKey)
            .addHeader("Content-Type", "application/json")
            .post(body.toString().toRequestBody(jsonType))
            .build()
        return try {
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                when {
                    resp.isSuccessful -> PairingProtocol.parseSession(text, nowEpochSeconds())
                        ?.let { Result.Ok(it) }
                        ?: Result.Error(PairingProtocol.INVALID_RESPONSE)
                    PairingProtocol.isSessionLost(resp.code, text) -> Result.Lost
                    // Limite d'inscriptions anonymes par IP (≈ 10/h), même sans error_code.
                    resp.code == 429 -> Result.Error("over_request_rate_limit")
                    else -> Result.Error(PairingProtocol.authErrorCode(resp.code, text))
                }
            }
        } catch (_: Exception) {
            // Message d'exception volontairement ignoré (peut contenir l'URL/l'hôte).
            Result.Error(PairingProtocol.NETWORK_ERROR)
        }
    }

    fun nowEpochSeconds(): Long = System.currentTimeMillis() / 1000

    /** Rafraîchissement proactif conseillé (§4) : expire dans moins de 60 s. */
    fun expiresSoon(expiresAt: Long): Boolean =
        expiresAt > 0 && expiresAt - nowEpochSeconds() < PairingProtocol.REFRESH_MARGIN_SECONDS
}
