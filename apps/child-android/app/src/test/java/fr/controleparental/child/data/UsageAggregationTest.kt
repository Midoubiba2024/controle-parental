package fr.controleparental.child.data

import fr.controleparental.child.data.UsageAggregation.Event
import fr.controleparental.child.data.UsageAggregation.Type
import org.junit.Assert.assertEquals
import org.junit.Test

/** Tour 6 V5 : session à cheval sur la fin d'une coupure (début de sous-fenêtre). */
class UsageAggregationTest {

    @Test fun sessionStraddlingWindowStartCountsFromWindowStart() {
        // Coupure jusqu'à 1000 ; l'app était au premier plan avant, arrêtée à 1600.
        val agg = UsageAggregation.aggregate(listOf(Event("org.exemple.jeu", Type.PAUSED, 1_600)), start = 1_000, end = 5_000)
        assertEquals(600L, agg.getValue("org.exemple.jeu").foregroundMs)
        assertEquals(0, agg.getValue("org.exemple.jeu").launches)
    }

    @Test fun onlyTheFirstOrphanPauseOpensAtWindowStart() {
        val events = listOf(
            Event("org.exemple.jeu", Type.PAUSED, 1_600),
            Event("org.exemple.jeu", Type.PAUSED, 1_900),          // second arrêt orphelin : ignoré
            Event("org.exemple.jeu", Type.RESUMED, 2_000),
            Event("org.exemple.jeu", Type.PAUSED, 2_500),
        )
        val a = UsageAggregation.aggregate(events, 1_000, 5_000).getValue("org.exemple.jeu")
        assertEquals(600L + 500L, a.foregroundMs)
        assertEquals(1, a.launches)
    }

    @Test fun openSessionIsClosedAtWindowEndAndWindowsAccumulate() {
        val into = UsageAggregation.aggregate(listOf(Event("org.exemple.ecole", Type.RESUMED, 4_000)), 1_000, 5_000)
        UsageAggregation.aggregate(listOf(Event("org.exemple.ecole", Type.PAUSED, 8_300)), 8_000, 9_000, into)
        assertEquals(1_000L + 300L, into.getValue("org.exemple.ecole").foregroundMs)
    }
}
