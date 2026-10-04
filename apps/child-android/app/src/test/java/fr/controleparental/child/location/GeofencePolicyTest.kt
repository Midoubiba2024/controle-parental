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

    @Test fun registersOnlyWithFineLocationAndAlertsEnabled() {
        assertTrue(GeofencePolicy.shouldRegister(hasFineLocation = true, geofenceAlertsEnabled = true))
    }

    @Test fun alertsDisabledUnregistersEvenWithPermission() {
        assertFalse(GeofencePolicy.shouldRegister(hasFineLocation = true, geofenceAlertsEnabled = false))
    }

    @Test fun noFineLocationMeansNoZones() {
        assertFalse(GeofencePolicy.shouldRegister(hasFineLocation = false, geofenceAlertsEnabled = true))
        assertFalse(GeofencePolicy.shouldRegister(hasFineLocation = false, geofenceAlertsEnabled = false))
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
