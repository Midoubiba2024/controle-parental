package fr.controleparental.child.location

import fr.controleparental.child.location.SosChoice.RowState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Tour 6 V2 : un second SOS en échec ne coupe pas la diffusion du premier. */
class SosChoiceTest {

    @Test fun currentRowPresentWins() {
        assertEquals("sos-2", SosChoice.next("sos-2", RowState.PRESENT, "sos-1", null, kept = null))
    }

    @Test fun absentSecondSosFallsBackToFirstStillActive() {
        assertEquals("sos-1", SosChoice.next("sos-2", RowState.ABSENT, "sos-1", RowState.PRESENT, kept = "sos-1"))
        assertNull(SosChoice.next("sos-2", RowState.ABSENT, "sos-1", RowState.ABSENT, kept = "sos-1"))
        assertNull(SosChoice.next("sos-2", RowState.ABSENT, null, null, kept = "sos-1"))
    }

    @Test fun networkErrorKeepsCurrentChoice() {
        assertEquals("sos-1", SosChoice.next("sos-2", RowState.ERROR, "sos-1", null, kept = "sos-1"))
        assertEquals("sos-1", SosChoice.next("sos-2", RowState.ABSENT, "sos-1", RowState.ERROR, kept = "sos-1"))
    }
}
