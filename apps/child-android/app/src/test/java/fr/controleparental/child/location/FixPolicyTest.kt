package fr.controleparental.child.location

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Tour 6 V1 : fraîcheur MONOTONE des relevés SOS, borne d'appairage sinon. */
class FixPolicyTest {

    private val enrolledAt = 1_000_000_000L
    private val min = 60 * 1_000_000_000L

    @Test fun yesterdaysCachedFixIsRejectedEvenForSos() {
        val yesterday = enrolledAt - 86_400_000L
        assertFalse(FixPolicy.accept("sos", yesterday, enrolledAt, ageNs = 24 * 60 * min))
        assertFalse(FixPolicy.accept("periodic", yesterday, enrolledAt, ageNs = 1))
    }

    @Test fun freshSosFixWithClockBehindPairingIsAccepted() {
        assertTrue(FixPolicy.accept("sos", enrolledAt - 3_600_000L, enrolledAt, ageNs = 10 * 1_000_000_000L))
        // Hors SOS, la borne d'appairage s'applique.
        assertFalse(FixPolicy.accept("on_demand", enrolledAt - 3_600_000L, enrolledAt, ageNs = 10 * 1_000_000_000L))
    }

    @Test fun negativeHugeOrMissingAgeFallsBackToPairingBound() {
        assertFalse(FixPolicy.accept("sos", enrolledAt - 1, enrolledAt, ageNs = -5))
        assertFalse(FixPolicy.accept("sos", enrolledAt - 1, enrolledAt, ageNs = Long.MAX_VALUE))
        assertFalse(FixPolicy.accept("sos", enrolledAt - 1, enrolledAt, ageNs = null))
        assertTrue(FixPolicy.accept("sos", enrolledAt + 1, enrolledAt, ageNs = null))
    }
}
