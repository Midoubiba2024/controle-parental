package fr.controleparental.child.location

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** T1 : diffusion SOS seulement pour le SOS déclenché sur cet appareil, dans sa fenêtre. */
class SosWindowTest {

    private val max = 15 * 60_000L

    @Test fun localSosInsideWindowIsLive() {
        assertTrue(SosWindow.isLive("sos-1", "sos-1", 7, 7, 1_000, 1_000 + max, max))
    }

    @Test fun rowReopenedByParentIsNeverLive() {
        // Ancien SOS repassé en « active » côté serveur : identifiant différent ou aucun SOS local.
        assertFalse(SosWindow.isLive("sos-ancien", "sos-1", 7, 7, 1_000, 2_000, max))
        assertFalse(SosWindow.isLive("sos-ancien", null, 7, 7, 0, 2_000, max))
    }

    @Test fun windowIsMeasuredOnElapsedTimeAndBoot() {
        assertFalse(SosWindow.isLive("sos-1", "sos-1", 7, 7, 1_000, 1_001 + max, max))
        assertFalse(SosWindow.isLive("sos-1", "sos-1", 7, 8, 1_000, 2_000, max))   // redémarrage
        assertFalse(SosWindow.isLive("sos-1", "sos-1", 7, 7, 5_000, 1_000, max))   // incohérent
    }
}
