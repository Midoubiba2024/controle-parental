package fr.controleparental.child.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** T2 : aucune collecte rétroactive après une période sans supervision visible. */
class VisibilityWindowTest {

    private val t0 = 1_000_000_000L

    @Test fun firstVisibilityStartsTheWindow() {
        val step = VisibilityWindow.onVisible(VisibilityWindow.State(0, 0), t0)
        assertEquals(VisibilityWindow.State(t0, t0), step.state)
        assertEquals(t0, step.resetAt)
        assertTrue(step.persist)
    }

    @Test fun continuousVisibilityKeepsTheWindowAndBeatsOncePerMinute() {
        val s = VisibilityWindow.State(t0, t0)
        val quick = VisibilityWindow.onVisible(s, t0 + 3_000)
        assertEquals(s, quick.state); assertNull(quick.resetAt); assertFalse(quick.persist)
        val beat = VisibilityWindow.onVisible(s, t0 + 61_000)
        assertEquals(VisibilityWindow.State(t0, t0 + 61_000), beat.state)
        assertNull(beat.resetAt); assertTrue(beat.persist)
    }

    @Test fun returnAfterAGapRestartsTheWindow() {
        val s = VisibilityWindow.State(t0, t0 + 60_000)
        val back = VisibilityWindow.onVisible(s, t0 + 60_000 + VisibilityWindow.GAP_MS + 1)
        assertEquals(t0 + 60_000 + VisibilityWindow.GAP_MS + 1, back.resetAt)
        assertEquals(back.resetAt, back.state.visibleSince)
    }

    @Test fun clockMovedBackwardsRestartsTheWindow() {
        val back = VisibilityWindow.onVisible(VisibilityWindow.State(t0, t0), t0 - 10_000)
        assertEquals(t0 - 10_000, back.resetAt)
    }
}
