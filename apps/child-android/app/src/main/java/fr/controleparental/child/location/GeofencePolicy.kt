package fr.controleparental.child.location

/**
 * Décision PURE (testable en JVM) : faut-il enregistrer les zones (geofences) sur
 * l'appareil ?
 *
 * Les alertes de zones sont un réglage SÉPARÉ du partage de position
 * (location_settings.geofence_alerts_enabled) : elles peuvent rester actives quand
 * la position est sur « off », et inversement. Il faut aussi les permissions de
 * position précise ET en arrière-plan, sans lesquelles Android refuse
 * l'enregistrement.
 */
object GeofencePolicy {
    /**
     * [hasBackgroundLocation] : ACCESS_BACKGROUND_LOCATION, exigée par Android 10+
     * pour les geofences (true sous Android 10, où elle n'existe pas).
     * [geofenceAlertsEnabled] : réglage parent ; INCONNU (hors ligne, jamais lu) →
     * l'appelant passe false (échec fermé).
     */
    fun shouldRegister(
        hasFineLocation: Boolean,
        hasBackgroundLocation: Boolean,
        geofenceAlertsEnabled: Boolean,
    ): Boolean = hasFineLocation && hasBackgroundLocation && geofenceAlertsEnabled
}
