package fr.controleparental.child.location

/**
 * Décision PURE (testable en JVM) : faut-il enregistrer les zones (geofences) sur
 * l'appareil ?
 *
 * Les alertes de zones sont un réglage SÉPARÉ du partage de position
 * (location_settings.geofence_alerts_enabled) : elles peuvent rester actives quand
 * la position est sur « off », et inversement. Il faut aussi la permission de
 * position précise, sans laquelle Android refuse l'enregistrement.
 */
object GeofencePolicy {
    fun shouldRegister(hasFineLocation: Boolean, geofenceAlertsEnabled: Boolean): Boolean =
        hasFineLocation && geofenceAlertsEnabled
}
