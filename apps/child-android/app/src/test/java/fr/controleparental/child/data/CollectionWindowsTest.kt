package fr.controleparental.child.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Minimisation (LOT 12b) : aucune donnée antérieure à l'appairage ne part, même
 * si l'appareil a déjà servi à un autre enfant. Horodatages FICTIFS.
 */
class CollectionWindowsTest {

    private val day = 86_400_000L
    private val d0 = 20_000 * day          // minuit d'un jour quelconque

    @Test fun callsStartAtPairingEvenWithAResetWatermark() {
        val enrolledAt = d0 + 10 * 3_600_000L
        assertEquals(enrolledAt, CollectionWindows.callsSince(watermark = 0, enrolledAt = enrolledAt))
        assertEquals(enrolledAt + 5, CollectionWindows.callsSince(watermark = enrolledAt + 5, enrolledAt = enrolledAt))
    }

    @Test fun legacyEnrollmentKeepsPreviousBehaviour() {
        assertEquals(1_234L, CollectionWindows.callsSince(watermark = 1_234, enrolledAt = 0))
        assertEquals(d0 to d0 + day, CollectionWindows.usageWindow(d0, d0 + day, enrolledAt = 0))
    }

    @Test fun daysEntirelyBeforePairingAreSkipped() {
        val enrolledAt = d0 + 2 * day + 3_600_000L
        assertNull(CollectionWindows.usageWindow(d0, d0 + day, enrolledAt))              // J-2
        assertNull(CollectionWindows.usageWindow(d0 + day, d0 + 2 * day, enrolledAt))    // J-1
    }

    @Test fun pairingDayStartsAtPairing() {
        val enrolledAt = d0 + 9 * 3_600_000L
        val now = d0 + 15 * 3_600_000L
        assertEquals(enrolledAt to now, CollectionWindows.usageWindow(d0, now, enrolledAt))
    }

    @Test fun daysAfterPairingAreComplete() {
        val enrolledAt = d0 - 3_600_000L
        assertEquals(d0 to d0 + day, CollectionWindows.usageWindow(d0, d0 + day, enrolledAt))
    }

    @Test fun quotaUsageOfPairingDayCountsOnlySincePairing() {
        // Quotas (EnforcementManager) : appairage à 14 h, usage du matin exclu.
        val enrolledAt = d0 + 14 * 3_600_000L
        val now = d0 + 18 * 3_600_000L
        val (start, end) = CollectionWindows.usageWindow(d0, now, enrolledAt)!!
        assertEquals(enrolledAt, start)
        assertEquals(4 * 3_600_000L, end - start)
    }

    @Test fun enrolledAtInTheFutureIsClampedAndRewritten() {
        val now = d0 + 3_600_000L
        assertEquals(CollectionWindows.Clamp(now, now), CollectionWindows.clampEnrolledAt(now + day, now))
        assertEquals(CollectionWindows.Clamp(now - 5, null), CollectionWindows.clampEnrolledAt(now - 5, now))
        assertEquals(CollectionWindows.Clamp(0, null), CollectionWindows.clampEnrolledAt(0, now))
    }

    @Test fun collectionStartsAtLastReturnToVisibility() {
        assertEquals(d0 + 50, CollectionWindows.notBefore(enrolledAt = d0, visibleSince = d0 + 50))
        assertEquals(d0, CollectionWindows.notBefore(enrolledAt = d0, visibleSince = 0))
    }
}
