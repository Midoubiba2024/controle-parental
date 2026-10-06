package fr.controleparental.child.pairing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Analyse des réponses GoTrue et de la RPC `pairing_complete`, et correspondance
 * code d'erreur → message (docs/14-APPAIRAGE.md §2–§5). Données FICTIVES.
 */
class PairingProtocolTest {

    private val dev = "11111111-1111-1111-1111-111111111111"
    private val fam = "22222222-2222-2222-2222-222222222222"
    private val kid = "33333333-3333-3333-3333-333333333333"

    // --- RPC pairing_complete -------------------------------------------------

    @Test fun rpcSuccess() {
        val r = PairingProtocol.parseRpc(
            """{"device_id":"$dev","family_id":"$fam","child_id":"$kid","mode":"reinforced"}""",
        )
        assertEquals(RpcOutcome.Paired(dev, fam, kid, "reinforced", alreadyPaired = false), r)
    }

    @Test fun rpcAlreadyPairedIsASuccess() {
        val r = PairingProtocol.parseRpc(
            """{"device_id":"$dev","family_id":"$fam","child_id":"$kid","mode":"standard","already_paired":true}""",
        )
        assertEquals(RpcOutcome.Paired(dev, fam, kid, "standard", alreadyPaired = true), r)
    }

    @Test fun rpcUnknownModeFallsBackToStandard() {
        val r = PairingProtocol.parseRpc("""{"device_id":"$dev","family_id":"$fam","child_id":"$kid"}""")
        assertEquals("standard", (r as RpcOutcome.Paired).mode)
    }

    @Test fun rpcErrorKeyIsTestedFirst() {
        // Même avec d'autres clés présentes, `error` l'emporte.
        val r = PairingProtocol.parseRpc("""{"error":"code_expired","device_id":"$dev"}""")
        assertEquals(RpcOutcome.Failed("code_expired"), r)
    }

    @Test fun rpcEveryContractErrorIsParsed() {
        val codes = listOf(
            "invalid_code_format", "code_not_found", "code_already_used", "code_expired",
            "invalid_device", "device_already_paired", "anonymous_session_required",
            "parent_account_forbidden", "not_authenticated",
        )
        for (c in codes) {
            assertEquals(RpcOutcome.Failed(c), PairingProtocol.parseRpc("""{"error":"$c"}"""))
        }
    }

    @Test fun rpcTooManyAttemptsCarriesRetryAfter() {
        val r = PairingProtocol.parseRpc("""{"error":"too_many_attempts","retry_after_seconds":754}""")
        assertEquals(RpcOutcome.Failed("too_many_attempts", 754), r)
    }

    @Test fun rpcMalformedBodiesAreInvalidResponses() {
        val invalid = RpcOutcome.Failed(PairingProtocol.INVALID_RESPONSE)
        assertEquals(invalid, PairingProtocol.parseRpc(""))
        assertEquals(invalid, PairingProtocol.parseRpc("[]"))
        assertEquals(invalid, PairingProtocol.parseRpc("""{"device_id":"$dev"}"""))
    }

    @Test fun retryMinutesRoundsUp() {
        assertEquals(1, PairingProtocol.retryMinutes(1))
        assertEquals(1, PairingProtocol.retryMinutes(60))
        assertEquals(2, PairingProtocol.retryMinutes(61))
        assertEquals(13, PairingProtocol.retryMinutes(754))
        assertEquals(15, PairingProtocol.retryMinutes(900))
    }

    // --- GoTrue ----------------------------------------------------------------

    @Test fun sessionExpiryUsesLocalClockAndExpiresIn() {
        // expires_at (horloge serveur) ignoré quand expires_in est présent : un
        // téléphone avancé d'une heure ne voit pas un jeton déjà expiré.
        val localNow = 1_791_120_000L + 3_600
        val s = PairingProtocol.parseSession(
            """{"access_token":"jeton-a","token_type":"bearer","expires_in":3600,"expires_at":1791120000,
               "refresh_token":"jeton-r","user":{"id":"$kid","is_anonymous":true}}""",
            nowEpochSeconds = localNow,
        )
        assertEquals(AuthSession("jeton-a", "jeton-r", localNow + 3_600, kid, obtainedAt = localNow), s)
        assertFalse(PairingProtocol.shouldRefreshProactively(s!!.expiresAt, s.obtainedAt, localNow + 1))
    }

    @Test fun sessionExpiresInFallsBackToExpiresAt() {
        val s = PairingProtocol.parseSession(
            """{"access_token":"a","expires_at":4600,"refresh_token":"r","user":{"id":"$kid"}}""",
            nowEpochSeconds = 1_000,
        )
        assertEquals(4_600L, s!!.expiresAt)
    }

    @Test fun proactiveRefreshRules() {
        // Expire dans moins de 60 s → rafraîchir.
        assertTrue(PairingProtocol.shouldRefreshProactively(expiresAt = 1_050, obtainedAt = 0, nowEpochSeconds = 1_000))
        assertTrue(PairingProtocol.shouldRefreshProactively(expiresAt = 1_050, obtainedAt = 900, nowEpochSeconds = 1_000))
        // Encore valable longtemps → non.
        assertFalse(PairingProtocol.shouldRefreshProactively(expiresAt = 4_600, obtainedAt = 1_000, nowEpochSeconds = 1_000))
        // Échéance inconnue (ancien enrôlement) → jamais de proactif (le 401 s'en charge).
        assertFalse(PairingProtocol.shouldRefreshProactively(expiresAt = 0, obtainedAt = 0, nowEpochSeconds = 1_000))
        // Jeton reçu il y a moins de 30 s : pas de nouvelle rotation, même si
        // l'échéance semble proche (expires_in très court, horloge qui saute).
        assertFalse(PairingProtocol.shouldRefreshProactively(expiresAt = 1_020, obtainedAt = 990, nowEpochSeconds = 1_000))
        assertTrue(PairingProtocol.shouldRefreshProactively(expiresAt = 1_020, obtainedAt = 960, nowEpochSeconds = 1_000))
    }

    @Test fun cappedBlockIsRewrittenSoItEventuallyEnds() {
        val now = 10_000_000L
        // Borne appliquée → valeur à réécrire = now + 15 min.
        val c = PairingProtocol.clampBlockedUntil(now + 5 * 3_600_000, now)
        assertEquals(PairingProtocol.BlockClamp(now + 900_000, now + 900_000), c)
        // Relue 16 min plus tard : la valeur réécrite est échue, pas de nouvelle borne.
        val later = now + 960_000
        assertEquals(PairingProtocol.BlockClamp(now + 900_000, null), PairingProtocol.clampBlockedUntil(c.toPersist!!, later))
        assertFalse(PairingProtocol.clampBlockedUntil(c.toPersist!!, later).effective > later)
        // Valeur normale : rien à réécrire.
        assertEquals(PairingProtocol.BlockClamp(now + 754_000, null), PairingProtocol.clampBlockedUntil(now + 754_000, now))
    }

    @Test fun blockedUntilIsCappedAtFifteenMinutes() {
        val now = 10_000_000L
        // Valeur normale (≤ 15 min + marge) : conservée.
        assertEquals(now + 754_000, PairingProtocol.effectiveBlockedUntil(now + 754_000, now))
        assertEquals(now + 960_000, PairingProtocol.effectiveBlockedUntil(now + 960_000, now))
        // Horloge reculée de plusieurs heures : ramenée à 15 min.
        assertEquals(now + 900_000, PairingProtocol.effectiveBlockedUntil(now + 5 * 3_600_000, now))
        // Échéance passée : pas de blocage.
        assertEquals(now - 1, PairingProtocol.effectiveBlockedUntil(now - 1, now))
    }

    @Test fun incompleteSessionIsRejected() {
        assertNull(PairingProtocol.parseSession("""{"access_token":"a","user":{"id":"$kid"}}""", 0))
        assertNull(PairingProtocol.parseSession("""{"access_token":"a","refresh_token":"r"}""", 0))
        assertNull(PairingProtocol.parseSession("pas du json", 0))
    }

    @Test fun authErrorCodes() {
        assertEquals(
            "anonymous_provider_disabled",
            PairingProtocol.authErrorCode(422, """{"code":422,"error_code":"anonymous_provider_disabled","msg":"Anonymous sign-ins are disabled"}"""),
        )
        assertEquals("invalid_grant", PairingProtocol.authErrorCode(400, """{"error":"invalid_grant"}"""))
        assertEquals("http_502", PairingProtocol.authErrorCode(502, "<html>"))
        // 5xx avec error_code : indisponibilité, pas un code « métier ».
        assertEquals("http_500", PairingProtocol.authErrorCode(500, """{"code":500,"error_code":"unexpected_failure"}"""))
        assertEquals(PairingMessage.UNAVAILABLE, PairingMessages.forCode(PairingProtocol.authErrorCode(500, """{"error_code":"unexpected_failure"}""")))
    }

    @Test fun lostSessionDetection() {
        assertTrue(PairingProtocol.isSessionLost(400, """{"code":400,"error_code":"refresh_token_not_found","msg":"Invalid Refresh Token: Refresh Token Not Found"}"""))
        assertTrue(PairingProtocol.isSessionLost(400, """{"code":400,"error_code":"refresh_token_already_used","msg":"Invalid Refresh Token: Already Used"}"""))
        assertTrue(PairingProtocol.isSessionLost(400, """{"error":"invalid_grant","error_description":"Invalid Refresh Token: Refresh Token Not Found"}"""))
        assertTrue(PairingProtocol.isSessionLost(403, """{"code":403,"error_code":"user_not_found","msg":"User from sub claim in JWT does not exist"}"""))
        // Indisponibilité / limite : la session n'est PAS perdue.
        assertFalse(PairingProtocol.isSessionLost(500, """{"error_code":"unexpected_failure"}"""))
        assertFalse(PairingProtocol.isSessionLost(429, """{"error_code":"over_request_rate_limit"}"""))
        assertFalse(PairingProtocol.isSessionLost(403, """{"error_code":"forbidden"}"""))
        assertFalse(PairingProtocol.isSessionLost(400, ""))
    }

    // --- Messages ----------------------------------------------------------------

    @Test fun everyContractCodeHasItsMessage() {
        val expected = mapOf(
            "invalid_code_format" to PairingMessage.INVALID_FORMAT,
            "code_not_found" to PairingMessage.NOT_FOUND,
            "code_already_used" to PairingMessage.ALREADY_USED,
            "code_expired" to PairingMessage.EXPIRED,
            "too_many_attempts" to PairingMessage.TOO_MANY_ATTEMPTS,
            "invalid_device" to PairingMessage.INVALID_DEVICE,
            "device_already_paired" to PairingMessage.DEVICE_MUST_REPAIR,
            "anonymous_session_required" to PairingMessage.CONNECTION_PROBLEM,
            "parent_account_forbidden" to PairingMessage.CONNECTION_PROBLEM,
            "not_authenticated" to PairingMessage.UNAVAILABLE,
            "anonymous_provider_disabled" to PairingMessage.PAIRING_DISABLED,
            "over_request_rate_limit" to PairingMessage.NETWORK_RATE_LIMITED,
            "session_lost" to PairingMessage.SESSION_EXPIRED,
            "device_revoked" to PairingMessage.DEVICE_REVOKED,
            PairingProtocol.NETWORK_ERROR to PairingMessage.UNAVAILABLE,
            "http_503" to PairingMessage.UNAVAILABLE,
        )
        for ((code, msg) in expected) assertEquals(code, msg, PairingMessages.forCode(code))
    }

    @Test fun unknownCodesFallBackToGenericMessage() {
        assertEquals(PairingMessage.GENERIC, PairingMessages.forCode("code_from_newer_server"))
        assertEquals(PairingMessage.GENERIC, PairingMessages.forCode("http_404"))
        assertEquals(PairingMessage.GENERIC, PairingMessages.forCode(PairingProtocol.INVALID_RESPONSE))
    }
}
