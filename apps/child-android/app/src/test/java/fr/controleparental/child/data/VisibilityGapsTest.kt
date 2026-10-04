package fr.controleparental.child.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Coupures OBSERVÉES de la supervision (tour 5, U1) et exclusion de la
 * collecte. Horodatages FICTIFS.
 */
class VisibilityGapsTest {

    private val p = "processus-1"
    private val boot = 3
    private val h = 3_600_000L
    private val d0 = 20_000 * 24 * h                 // minuit d'un jour quelconque
    private val gap = VisibilityGaps::Gap

    private fun visible(s: VisibilityGaps.State, now: Long, token: String = p, b: Int = boot) =
        VisibilityGaps.observe(s, true, now, token, b).state

    private fun hidden(s: VisibilityGaps.State, now: Long, token: String = p, b: Int = boot) =
        VisibilityGaps.observe(s, false, now, token, b).state

    @Test fun shortObservedCutIsExcluded() {
        var s = visible(VisibilityGaps.State(), d0 + 10 * h)
        s = hidden(s, d0 + 10 * h + 5_000)          // constat : non visible
        s = visible(s, d0 + 10 * h + 35_000)        // retour 30 s plus tard
        assertEquals(listOf(gap(d0 + 10 * h, d0 + 10 * h + 35_000)), s.gaps)
    }

    @Test fun twoHourSleepWithoutObservedCutExcludesNothing() {
        // Doze : la boucle ne tourne pas, mais le service et la notification vivent.
        var s = visible(VisibilityGaps.State(), d0 + 8 * h)
        s = visible(s, d0 + 10 * h)
        assertEquals(emptyList<VisibilityGaps.Gap>(), s.gaps)
        assertEquals(0L, s.invisibleFrom)
    }

    @Test fun newProcessIsACutFromLastPersistedHeartbeat() {
        var s = visible(VisibilityGaps.State(), d0 + 8 * h)
        s = visible(s, d0 + 9 * h, token = "processus-2")
        assertEquals(listOf(gap(d0 + 8 * h, d0 + 9 * h)), s.gaps)
        // Nouveau démarrage : idem.
        s = visible(s, d0 + 11 * h, token = "processus-2", b = boot + 1)
        assertEquals(gap(d0 + 9 * h, d0 + 11 * h), s.gaps.last())
    }

    @Test fun severalCutsInADayAreAllExcludedFromUsage() {
        var s = visible(VisibilityGaps.State(), d0 + 8 * h)
        s = hidden(s, d0 + 9 * h); s = visible(s, d0 + 10 * h)
        s = visible(s, d0 + 14 * h)                 // battement de la boucle
        s = hidden(s, d0 + 14 * h + 1); s = visible(s, d0 + 15 * h)
        val w = CollectionWindows.visibleWindows(d0, d0 + 18 * h, enrolledAt = d0 + 7 * h, gaps = s.gaps)
        // Coupures ouvertes au DERNIER battement visible connu (échec fermé).
        assertEquals(listOf(d0 + 7 * h to d0 + 8 * h, d0 + 10 * h to d0 + 14 * h, d0 + 15 * h to d0 + 18 * h), w)
    }

    @Test fun cutObservedAfterLongSilenceStartsAtLastKnownVisible() {
        // Aucune observation pendant 3 h, puis constat « non visible » : on ne sait
        // pas quand la coupure a commencé → depuis le dernier battement (échec fermé).
        var s = visible(VisibilityGaps.State(), d0 + 8 * h)
        s = hidden(s, d0 + 11 * h)
        assertEquals(d0 + 8 * h, s.invisibleFrom)
    }

    @Test fun callsBeforeDuringAndAfterACut() {
        val gaps = listOf(gap(d0 + 10 * h, d0 + 11 * h))
        assertFalse(CollectionWindows.inGap(d0 + 10 * h - 1, gaps))   // juste avant
        assertTrue(CollectionWindows.inGap(d0 + 10 * h, gaps))        // début inclus
        assertTrue(CollectionWindows.inGap(d0 + 10 * h + 30 * 60_000L, gaps))
        assertFalse(CollectionWindows.inGap(d0 + 11 * h, gaps))       // juste après
    }

    @Test fun ongoingCutIsExcludedUntilNow() {
        var s = visible(VisibilityGaps.State(), d0 + 8 * h)
        s = hidden(s, d0 + 9 * h)
        assertEquals(listOf(gap(d0 + 8 * h, d0 + 12 * h)), VisibilityGaps.excluded(s, d0 + 12 * h))
    }

    @Test fun gapsArePurgedAfterThreeDaysAndSerialised() {
        var s = VisibilityGaps.State(lastVisibleAt = d0, processToken = p, boot = boot, gaps = listOf(gap(d0 - 5 * 24 * h, d0 - 4 * 24 * h)))
        s = visible(s, d0 + 1)
        assertEquals(emptyList<VisibilityGaps.Gap>(), s.gaps)
        val g = listOf(gap(1, 2), gap(10, 20))
        assertEquals(g, VisibilityGaps.gapsFromJson(VisibilityGaps.gapsToJson(g)))
        assertEquals(emptyList<VisibilityGaps.Gap>(), VisibilityGaps.gapsFromJson("pas du json"))
    }

    @Test fun periodBetweenPairingAndFirstVisibleIsExcluded() {
        // V3 : completeEnrollment pose invisibleFrom = enrolledAt.
        val enrolledAt = d0 + 9 * h
        val s = visible(VisibilityGaps.State(invisibleFrom = enrolledAt), enrolledAt + 5_000)
        assertEquals(listOf(gap(enrolledAt, enrolledAt + 5_000)), s.gaps)
    }

    @Test fun purgedGapsRaiseTheCallsFloor() {
        // V4 : une coupure purgée ne peut plus être exclue → les appels antérieurs ne sont plus relus.
        val old = gap(d0 - 6 * 24 * h, d0 - 5 * 24 * h)
        var s = VisibilityGaps.State(lastVisibleAt = d0, processToken = p, boot = boot, gaps = listOf(old))
        s = visible(s, d0 + 1)
        assertEquals(emptyList<VisibilityGaps.Gap>(), s.gaps)
        assertEquals(old.to, s.purgedThrough)
        assertEquals(old.to, VisibilityGaps.callsFloor(enrolledAt = d0 - 10 * 24 * h, s = s))
        assertEquals(d0, VisibilityGaps.callsFloor(enrolledAt = d0, s = s))
    }

    @Test fun gapsAreKeptFourDays() {
        val recent = gap(d0 - 3 * 24 * h - h, d0 - 3 * 24 * h)     // 3 j 1 h : conservée (< 4 j)
        val s = visible(VisibilityGaps.State(lastVisibleAt = d0, processToken = p, boot = boot, gaps = listOf(recent)), d0 + 1)
        assertEquals(listOf(recent), s.gaps)
    }
}
