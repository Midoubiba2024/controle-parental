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
}
