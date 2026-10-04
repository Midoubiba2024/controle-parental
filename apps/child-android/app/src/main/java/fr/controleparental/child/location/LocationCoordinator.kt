package fr.controleparental.child.location

import android.content.Context
import fr.controleparental.child.data.DeviceStatusCollector
import fr.controleparental.child.data.SupervisionStore
import java.time.Instant

/**
 * LOT 3 — Orchestration de la localisation côté appareil enfant, pilotée par la
 * boucle du service de supervision (SupervisionService).
 *
 * Responsabilités :
 *   * Relevés PÉRIODIQUES à cadence adaptative (si mode = periodic), pilotés par
 *     le réglage parent (location_settings) — graduation par âge.
 *   * Check-in À LA DEMANDE (commande 'locate', D2) — un relevé ponctuel.
 *   * Diffusion LIVE pendant un SOS (E2), BORNÉE dans le temps (MAX_SOS_LIVE_MS).
 *   * Alerte BATTERIE FAIBLE + dernière position connue (D7).
 *
 * MINIMISATION & TRANSPARENCE : on ne capte une position que lorsque c'est utile ;
 * la notification de supervision reste affichée ; rien n'est occulte.
 */
class LocationCoordinator(context: Context) {

    private val appContext = context.applicationContext
    private val client = LocationClient(appContext)
    private val repo = LocationRepository(SupervisionStore(appContext))
    private val geofences = GeofenceManager(appContext)

    @Volatile private var settings: LocationRepository.Settings = LocationRepository.Settings.DEFAULT

    private var lastPeriodicMs = 0L
    private var lastSosPollMs = 0L
    private var lastSosFixMs = 0L
    // Épisode SOS en cours connu (id + instant de début) ; null si aucun.
    private var sosId: String? = null
    private var sosStartedMs = 0L

    /** Rafraîchit le réglage de partage + ré-enregistre les geofences si besoin. */
    suspend fun onSync() {
        settings = runCatching { repo.settings() }.getOrDefault(LocationRepository.Settings.DEFAULT)
        runCatching { geofences.sync(client.hasFine()) }   // re-register seulement si les zones ont changé
    }

    /** Ré-enregistrement COMPLET des geofences après reboot (les geofences OS ne
     *  survivent pas au redémarrage). Appelé par BootReceiver (borné). */
    suspend fun registerGeofencesAfterBoot() {
        runCatching { geofences.sync(client.hasFine(), force = true) }
    }

    /** Appelé à chaque tick de la boucle (~3 s). Gère SOS live + relevé périodique. */
    suspend fun onTick() {
        val now = System.currentTimeMillis()
        handleSos(now)
        handlePeriodic(now)
    }

    private suspend fun handleSos(now: Long) {
        // Interroge l'état SOS à cadence modérée (évite de marteler la base).
        if (now - lastSosPollMs >= SOS_POLL_MS) {
            lastSosPollMs = now
            val row = runCatching { repo.activeSos() }.getOrNull()
            if (row != null) {
                sosId = row.optString("id")
                sosStartedMs = runCatching { Instant.parse(row.optString("started_at")).toEpochMilli() }
                    .getOrDefault(now)
            } else {
                sosId = null
            }
        }
        val active = sosId ?: return
        // Diffusion BORNÉE : au-delà de la fenêtre, on cesse de diffuser (l'épisode
        // reste ouvert jusqu'à clôture parent/enfant, mais plus de captation).
        if (now - sosStartedMs > MAX_SOS_LIVE_MS) return
        if (now - lastSosFixMs < SOS_FIX_MS) return
        lastSosFixMs = now
        if (active.isEmpty()) return
        val loc = client.currentFix(highAccuracy = true) ?: return
        repo.insertFix(loc, source = "sos", batteryLevel = batteryLevel())
    }

    private suspend fun handlePeriodic(now: Long) {
        val s = settings
        if (!s.enabled || s.mode != "periodic") return
        val intervalMs = s.periodicIntervalSec.coerceAtLeast(MIN_PERIODIC_INTERVAL_SEC) * 1000L
        if (now - lastPeriodicMs < intervalMs) return
        lastPeriodicMs = now
        val loc = client.currentFix(highAccuracy = s.highAccuracy) ?: return
        repo.insertFix(loc, source = "periodic", batteryLevel = batteryLevel())
    }

    /** Check-in ponctuel (commande 'locate', D2). Retourne true si une position
     *  a été remontée. */
    suspend fun checkInOnDemand(): Boolean {
        // On RECHARGE le réglage (il a pu changer) et on RESPECTE le choix du
        // parent : si le partage est désactivé (off / !enabled), on ne remonte
        // AUCUNE position — cohérent avec l'écran « mes données » qui dit alors
        // « partage désactivé ». Le SOS enfant (child-initiated) reste, lui,
        // toujours autorisé par un autre chemin.
        val s = runCatching { repo.settings() }.getOrDefault(settings)
        settings = s
        if (!s.enabled || s.mode == "off") return false
        val loc = client.currentFix(highAccuracy = s.highAccuracy) ?: return false
        return repo.insertFix(loc, source = "on_demand", batteryLevel = batteryLevel())
    }

    /** Batterie faible (D7) : remonte la dernière position + une alerte. Respecte
     *  le réglage de partage (pas de position si désactivé). */
    suspend fun onBatteryLow() {
        val s = runCatching { repo.settings() }.getOrDefault(settings)
        settings = s
        if (!s.enabled || s.mode == "off") return
        val battery = batteryLevel()
        val loc = client.lastKnown() ?: client.currentFix(highAccuracy = false)
        if (loc != null) repo.insertFix(loc, source = "periodic", batteryLevel = battery)
        repo.insertSafetyAlert("low_battery", battery)
    }

    private fun batteryLevel(): Int? = runCatching {
        DeviceStatusCollector(appContext).collect().batteryLevel
    }.getOrNull()

    companion object {
        private const val SOS_POLL_MS = 15_000L     // vérif de l'état SOS
        private const val SOS_FIX_MS = 12_000L      // cadence de diffusion live pendant SOS
        // Lues aussi par l'écran « mes données » : le texte affiché à l'enfant suit
        // le comportement réel.
        const val MAX_SOS_LIVE_MS = 15 * 60_000L  // diffusion bornée à 15 min
        const val MIN_PERIODIC_INTERVAL_SEC = 300 // plancher du relevé périodique

        /** Intervalle réellement appliqué au relevé périodique, en minutes (arrondi). */
        fun periodicIntervalMinutes(intervalSec: Int): Int =
            (intervalSec.coerceAtLeast(MIN_PERIODIC_INTERVAL_SEC) + 30) / 60
    }
}
