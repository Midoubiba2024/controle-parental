package fr.controleparental.child.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests de la décision PURE « enregistrer les zones ou non » (LOT 10b), et des
 * valeurs que l'écran « mes données » affiche à l'enfant (SOS, relevé périodique).
 */
class GeofencePolicyTest {

    private fun decide(fine: Boolean, background: Boolean, alerts: Boolean) =
        GeofencePolicy.shouldRegister(
            hasFineLocation = fine, hasBackgroundLocation = background, geofenceAlertsEnabled = alerts,
        )

    @Test fun registersOnlyWithBothPermissionsAndAlertsEnabled() {
        assertTrue(decide(fine = true, background = true, alerts = true))
    }

    @Test fun alertsDisabledOrUnknownUnregistersEvenWithPermissions() {
        // Réglage inconnu (hors ligne, jamais lu) : l'appelant passe false → échec fermé.
        assertFalse(decide(fine = true, background = true, alerts = false))
    }

    @Test fun missingPermissionMeansNoZones() {
        assertFalse(decide(fine = false, background = true, alerts = true))
        assertFalse(decide(fine = true, background = false, alerts = true))   // Android 10+ sans arrière-plan
        assertFalse(decide(fine = false, background = false, alerts = false))
    }

    @Test fun defaultSettingsKeepZoneAlertsOn() {
        // Sans réglage en base (ou colonne absente), le comportement d'avant est conservé.
        assertTrue(LocationRepository.Settings.DEFAULT.geofenceAlertsEnabled)
    }

    @Test fun periodicIntervalShownToTheChildMatchesTheAppliedOne() {
        assertEquals(15, LocationCoordinator.periodicIntervalMinutes(900))
        assertEquals(5, LocationCoordinator.periodicIntervalMinutes(60))   // plancher de 5 min
        assertEquals(5, LocationCoordinator.periodicIntervalMinutes(300))
        assertEquals(10, LocationCoordinator.periodicIntervalMinutes(610))
    }

    @Test fun sosLiveDurationIsFifteenMinutes() {
        assertEquals(15L, LocationCoordinator.MAX_SOS_LIVE_MS / 60_000L)
    }
}
