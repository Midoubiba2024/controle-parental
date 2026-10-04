package fr.controleparental.child.data

import android.provider.CallLog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests de la fonction PURE « numéro → hash ou null » (LOT 10b). Un appel anonyme
 * (numéro absent, vide, privé, masqué) ne doit JAMAIS partager un hash commun :
 * sinon la console regrouperait tous les appels masqués sous un faux correspondant.
 *
 * Numéros FICTIFS uniquement (plage réservée à la fiction en France : 01 99 00 xx xx).
 */
class CounterpartyHashTest {

    private val pepper = "poivre-de-test"
    private val allowed = CallLog.Calls.PRESENTATION_ALLOWED
    private val fakeNumber = "+33199001234"
    private val otherFakeNumber = "+33199005678"

    @Test fun normalNumberIsHashed() {
        val h = CounterpartyHash.of(fakeNumber, allowed, pepper)
        assertNotNull(h)
        assertEquals(64, h!!.length)                       // SHA-256 en hexadécimal
        assertTrue(h.all { it in '0'..'9' || it in 'a'..'f' })
        assertFalse(h.contains("1234"))                    // jamais le numéro en clair
    }

    @Test fun sameNumberGivesSameHashAndSpacesAreIgnored() {
        assertEquals(
            CounterpartyHash.of(fakeNumber, allowed, pepper),
            CounterpartyHash.of("  $fakeNumber ", allowed, pepper),
        )
    }

    @Test fun differentNumbersGiveDifferentHashes() {
        assertNotEquals(
            CounterpartyHash.of(fakeNumber, allowed, pepper),
            CounterpartyHash.of(otherFakeNumber, allowed, pepper),
        )
    }

    @Test fun pepperChangesTheHash() {
        assertNotEquals(
            CounterpartyHash.of(fakeNumber, allowed, pepper),
            CounterpartyHash.of(fakeNumber, allowed, "autre-poivre"),
        )
    }

    @Test fun hashFormatIsUnchangedForExistingGroupings() {
        // Même format que l'ancien CallLogCollector.hash() : sha256("poivre:numéro").
        assertEquals(
            CounterpartyHash.raw(fakeNumber, pepper),
            CounterpartyHash.of(fakeNumber, allowed, pepper),
        )
    }

    @Test fun absentOrBlankNumberGivesNull() {
        assertNull(CounterpartyHash.of(null, allowed, pepper))
        assertNull(CounterpartyHash.of("", allowed, pepper))
        assertNull(CounterpartyHash.of("   ", allowed, pepper))
    }

    @Test fun hiddenPresentationsGiveNullEvenWithANumber() {
        for (p in listOf(
            CallLog.Calls.PRESENTATION_RESTRICTED,
            CallLog.Calls.PRESENTATION_UNKNOWN,
            CallLog.Calls.PRESENTATION_PAYPHONE,
        )) {
            assertNull("présentation $p", CounterpartyHash.of(fakeNumber, p, pepper))
            assertNull("présentation $p", CounterpartyHash.of("", p, pepper))
        }
    }

    @Test fun legacyPrivateMarkersGiveNull() {
        for (marker in listOf("-1", "-2", "-3", " -2 ")) {
            assertNull("marqueur « $marker »", CounterpartyHash.of(marker, allowed, pepper))
        }
    }

    @Test fun missingPresentationColumnFallsBackOnTheNumber() {
        val notRead = CounterpartyHash.PRESENTATION_NOT_READ
        assertNotNull(CounterpartyHash.of(fakeNumber, notRead, pepper))
        assertNull(CounterpartyHash.of("", notRead, pepper))
        assertNull(CounterpartyHash.of("-2", notRead, pepper))
    }

    @Test fun anonymousCallsNeverShareAFakeCounterparty() {
        // Avant le LOT 10b, deux appels masqués recevaient le MÊME hash.
        val a = CounterpartyHash.of(null, CallLog.Calls.PRESENTATION_RESTRICTED, pepper)
        val b = CounterpartyHash.of("", CallLog.Calls.PRESENTATION_UNKNOWN, pepper)
        assertNull(a)
        assertNull(b)
    }
}
