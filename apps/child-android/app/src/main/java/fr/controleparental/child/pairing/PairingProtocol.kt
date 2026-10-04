package fr.controleparental.child.pairing

import org.json.JSONObject

/**
 * Analyse PURE des réponses d'appairage (docs/14-APPAIRAGE.md §2–§4) : sessions
 * GoTrue (inscription anonyme, rafraîchissement) et RPC `pairing_complete`.
 * Aucune E/S ici : testé en JVM avec la vraie implémentation org.json.
 *
 * 🔴 Les jetons ne sont jamais journalisés ni inclus dans un code d'erreur.
 */

/** Session GoTrue : [expiresAt] en secondes epoch (0 = inconnu). */
data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Long,
    val userId: String,
)

/** Résultat de la RPC `pairing_complete` (toujours HTTP 200 pour le métier). */
sealed interface RpcOutcome {
    data class Paired(
        val deviceId: String,
        val familyId: String,
        val childId: String,
        val mode: String,
        /** Rejeu idempotent par la même session : à traiter comme un succès. */
        val alreadyPaired: Boolean,
    ) : RpcOutcome

    data class Failed(val code: String, val retryAfterSeconds: Int? = null) : RpcOutcome
}

object PairingProtocol {

    /** Codes d'erreur produits CÔTÉ APPLI (hors contrat serveur). */
    const val NETWORK_ERROR = "network_error"
    const val INVALID_RESPONSE = "invalid_response"

    /** Marge de rafraîchissement proactif (§4) : expiration dans moins de 60 s. */
    const val REFRESH_MARGIN_SECONDS = 60L

    /**
     * Session GoTrue (§2, §4). `expires_at` prioritaire, sinon `now + expires_in`.
     * null si une valeur indispensable manque (réponse inattendue).
     */
    fun parseSession(body: String, nowEpochSeconds: Long): AuthSession? {
        val obj = runCatching { JSONObject(body) }.getOrNull() ?: return null
        val access = obj.optString("access_token")
        val refresh = obj.optString("refresh_token")
        val userId = obj.optJSONObject("user")?.optString("id").orEmpty()
        if (access.isBlank() || refresh.isBlank() || userId.isBlank()) return null
        val expiresAt = obj.optLong("expires_at", 0L).takeIf { it > 0 }
            ?: obj.optLong("expires_in", 0L).takeIf { it > 0 }?.let { nowEpochSeconds + it }
            ?: 0L
        return AuthSession(access, refresh, expiresAt, userId)
    }

    /**
     * Code d'erreur GoTrue (`{"code", "error_code", "msg"}` ; anciennes versions :
     * `{"error", "error_description"}`), sinon `http_<code>`.
     */
    fun authErrorCode(httpCode: Int, body: String): String {
        val obj = runCatching { JSONObject(body) }.getOrNull()
        val code = obj?.optString("error_code")?.takeIf { it.isNotBlank() }
            ?: obj?.optString("error")?.takeIf { it.isNotBlank() }
        return code ?: "http_$httpCode"
    }

    /**
     * Le refresh token est-il définitivement inutilisable (§4) ? 400
     * `refresh_token_not_found` / `refresh_token_already_used` / « Invalid Refresh
     * Token », ou 403 `user_not_found` (compte anonyme purgé, session révoquée).
     */
    fun isSessionLost(httpCode: Int, body: String): Boolean {
        val obj = runCatching { JSONObject(body) }.getOrNull()
        val code = obj?.optString("error_code").orEmpty()
        val msg = (obj?.optString("msg").orEmpty() + " " + obj?.optString("error_description").orEmpty())
        return when (httpCode) {
            400 -> code == "refresh_token_not_found" || code == "refresh_token_already_used" ||
                msg.contains("Invalid Refresh Token", ignoreCase = true)
            403 -> code == "user_not_found"
            else -> false
        }
    }

    /**
     * Corps HTTP 200 de la RPC (§3). La clé `error` est testée EN PREMIER ;
     * `already_paired: true` reste un succès.
     */
    fun parseRpc(body: String): RpcOutcome {
        val obj = runCatching { JSONObject(body) }.getOrNull()
            ?: return RpcOutcome.Failed(INVALID_RESPONSE)
        if (obj.has("error")) {
            val code = obj.optString("error").ifBlank { INVALID_RESPONSE }
            val retry = if (obj.has("retry_after_seconds")) obj.optInt("retry_after_seconds", 0) else null
            return RpcOutcome.Failed(code, retry?.coerceAtLeast(1))
        }
        val deviceId = obj.optString("device_id")
        val familyId = obj.optString("family_id")
        val childId = obj.optString("child_id")
        if (deviceId.isBlank() || familyId.isBlank() || childId.isBlank()) {
            return RpcOutcome.Failed(INVALID_RESPONSE)
        }
        val mode = obj.optString("mode").takeIf { it == "standard" || it == "reinforced" } ?: "standard"
        return RpcOutcome.Paired(deviceId, familyId, childId, mode, obj.optBoolean("already_paired", false))
    }

    /** Minutes affichées pour `too_many_attempts` : arrondi supérieur, au moins 1. */
    fun retryMinutes(retryAfterSeconds: Int): Int = maxOf(1, (retryAfterSeconds + 59) / 60)
}

/** Message affiché à l'enfant (chaque valeur ↔ une chaîne de strings.xml). */
enum class PairingMessage {
    INVALID_FORMAT,
    NOT_FOUND,
    ALREADY_USED,
    EXPIRED,
    TOO_MANY_ATTEMPTS,
    INVALID_DEVICE,
    DEVICE_MUST_REPAIR,
    CONNECTION_PROBLEM,
    UNAVAILABLE,
    PAIRING_DISABLED,
    NETWORK_RATE_LIMITED,
    SESSION_EXPIRED,
    DEVICE_REVOKED,
    GENERIC,
}

/** Correspondance code d'erreur → message (tableaux §2, §3, §4, §5 du contrat). */
object PairingMessages {

    fun forCode(code: String): PairingMessage = when (code) {
        // §3 — erreurs métier de la RPC
        "invalid_code_format" -> PairingMessage.INVALID_FORMAT
        "code_not_found" -> PairingMessage.NOT_FOUND
        "code_already_used" -> PairingMessage.ALREADY_USED
        "code_expired" -> PairingMessage.EXPIRED
        "too_many_attempts" -> PairingMessage.TOO_MANY_ATTEMPTS
        "invalid_device" -> PairingMessage.INVALID_DEVICE
        "device_already_paired" -> PairingMessage.DEVICE_MUST_REPAIR
        "anonymous_session_required", "parent_account_forbidden" -> PairingMessage.CONNECTION_PROBLEM
        "not_authenticated" -> PairingMessage.UNAVAILABLE
        // §2 — inscription anonyme (GoTrue)
        "anonymous_provider_disabled" -> PairingMessage.PAIRING_DISABLED
        "over_request_rate_limit" -> PairingMessage.NETWORK_RATE_LIMITED
        // §4 / §5 — session de l'appareil perdue, appareil retiré
        "session_lost" -> PairingMessage.SESSION_EXPIRED
        "device_revoked" -> PairingMessage.DEVICE_REVOKED
        // Réseau / indisponibilité (5xx, délai, verrou 55P03)
        PairingProtocol.NETWORK_ERROR -> PairingMessage.UNAVAILABLE
        else -> if (code.startsWith("http_5")) PairingMessage.UNAVAILABLE else PairingMessage.GENERIC
    }
}
