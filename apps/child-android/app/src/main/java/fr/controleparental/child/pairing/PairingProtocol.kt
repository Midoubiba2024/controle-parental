package fr.controleparental.child.pairing

import org.json.JSONObject

/**
 * Analyse PURE des réponses d'appairage (docs/14-APPAIRAGE.md §2–§4) : sessions
 * GoTrue (inscription anonyme, rafraîchissement) et RPC `pairing_complete`.
 * Aucune E/S ici : testé en JVM avec la vraie implémentation org.json.
 *
 * 🔴 Les jetons ne sont jamais journalisés ni inclus dans un code d'erreur.
 */

/**
 * Session GoTrue. [expiresAt] : échéance en secondes epoch de l'HORLOGE LOCALE
 * (0 = inconnue) ; [obtainedAt] : réception, même horloge (0 = inconnue).
 */
data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Long,
    val userId: String,
    val obtainedAt: Long = 0L,
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

    /** Pas de rafraîchissement proactif d'un jeton reçu il y a moins de 30 s. */
    const val MIN_TOKEN_AGE_SECONDS = 30L

    /**
     * Session GoTrue (§2, §4). Échéance calculée sur l'HORLOGE LOCALE à la
     * réception (`now + expires_in`) : un téléphone en avance ou en retard ne
     * déclenche pas un rafraîchissement à chaque requête. `expires_at` (horloge
     * du serveur) n'est qu'un repli si `expires_in` manque.
     * null si une valeur indispensable manque (réponse inattendue).
     */
    fun parseSession(body: String, nowEpochSeconds: Long): AuthSession? {
        val obj = runCatching { JSONObject(body) }.getOrNull() ?: return null
        val access = obj.optString("access_token")
        val refresh = obj.optString("refresh_token")
        val userId = obj.optJSONObject("user")?.optString("id").orEmpty()
        if (access.isBlank() || refresh.isBlank() || userId.isBlank()) return null
        val expiresAt = obj.optLong("expires_in", 0L).takeIf { it > 0 }?.let { nowEpochSeconds + it }
            ?: obj.optLong("expires_at", 0L).takeIf { it > 0 }
            ?: 0L
        return AuthSession(access, refresh, expiresAt, userId, obtainedAt = nowEpochSeconds)
    }

    /**
     * Rafraîchissement proactif (§4) : expiration dans moins de 60 s, sauf échéance
     * inconnue (0) ou jeton reçu il y a moins de 30 s (évite toute rafale de
     * rotations si l'horloge du téléphone saute).
     */
    fun shouldRefreshProactively(expiresAt: Long, obtainedAt: Long, nowEpochSeconds: Long): Boolean {
        if (expiresAt <= 0) return false
        val age = nowEpochSeconds - obtainedAt
        if (obtainedAt > 0 && age in 0 until MIN_TOKEN_AGE_SECONDS) return false
        return expiresAt - nowEpochSeconds < REFRESH_MARGIN_SECONDS
    }

    /**
     * Code d'erreur GoTrue (`{"code", "error_code", "msg"}` ; anciennes versions :
     * `{"error", "error_description"}`), sinon `http_<code>` ; toujours
     * `http_<code>` pour un 5xx.
     */
    fun authErrorCode(httpCode: Int, body: String): String {
        // Indisponibilité serveur : toujours `http_5xx` (message « Connexion
        // impossible »), même si GoTrue fournit un error_code (`unexpected_failure`).
        if (httpCode >= 500) return "http_$httpCode"
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

    /** Fenêtre anti force brute du serveur : `retry_after_seconds` ≤ 15 min. */
    const val MAX_RETRY_AFTER_SECONDS = 900L

    /**
     * Fin effective du blocage `too_many_attempts` (epoch ms). La valeur est
     * persistée en heure murale : si l'horloge a reculé, elle pourrait bloquer des
     * heures. Au-delà de 15 min + 60 s de marge, on la ramène à `now + 15 min`
     * (le serveur ne demande jamais plus).
     */
    fun effectiveBlockedUntil(storedUntilMs: Long, nowMs: Long): Long =
        clampBlockedUntil(storedUntilMs, nowMs).effective

    /**
     * [effective] : fin de blocage à appliquer ; [toPersist] : valeur à RÉÉCRIRE
     * quand la borne s'applique (sinon null). Sans réécriture, chaque lecture
     * recalculerait « dans 15 min » et le blocage ne finirait jamais.
     */
    data class BlockClamp(val effective: Long, val toPersist: Long?)

    fun clampBlockedUntil(storedUntilMs: Long, nowMs: Long): BlockClamp {
        val maxMs = MAX_RETRY_AFTER_SECONDS * 1000
        return if (storedUntilMs - nowMs > maxMs + 60_000) {
            BlockClamp(nowMs + maxMs, nowMs + maxMs)
        } else {
            BlockClamp(storedUntilMs, null)
        }
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
