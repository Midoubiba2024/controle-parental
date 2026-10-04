package fr.controleparental.child.location

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Tasks
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.service.Unenrollment
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * LOT 3 — (Ré)enregistrement des zones de confiance (geofences D4/D5) dans
 * GeofencingClient. Les zones viennent de la base (définies par le parent) et
 * sont RÉ-ENREGISTRÉES après chaque reboot (les geofences OS ne survivent pas au
 * redémarrage) — appelé par BootReceiver et par la boucle de supervision.
 *
 * Transparent : l'enfant voit ses zones et les alertes « bien arrivé » dans son
 * app. Limite OS ~100 geofences/app : le parent reste bien en dessous.
 */
class GeofenceManager(private val context: Context) {

    private val client: GeofencingClient = LocationServices.getGeofencingClient(context)
    private val repo = LocationRepository(SupervisionStore(context))
    private val names = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun pendingIntent(): PendingIntent {
        val intent = Intent(context, GeofenceBroadcastReceiver::class.java)
        // MUTABLE requis : le système renseigne l'intent avec le GeofencingEvent.
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getBroadcast(context, 0, intent, flags)
    }

    /** Nom d'une zone depuis le cache local (pour l'instantané de l'événement). */
    fun nameOf(geofenceId: String): String? = names.getString(geofenceId, null)

    /** Nombre de zones enregistrées sur l'appareil au dernier sync (écran « mes données »). */
    fun registeredZoneCount(): Int = names.all.keys.count { it != KEY_SIG }

    /** Des zones sont-elles enregistrées par nous (dernier sync en mode « actif ») ? */
    fun isActive(): Boolean = names.contains(KEY_SIG)

    /**
     * Désenrôlement (LOT 12b) : retire INCONDITIONNELLEMENT toutes nos geofences et
     * vide le cache local (idempotent, sans appel réseau).
     */
    suspend fun removeAll() = withContext(Dispatchers.IO) {
        // Borné : le démontage ne doit jamais rester bloqué sur Play services.
        runCatching { Tasks.await(client.removeGeofences(pendingIntent()), AWAIT_S, TimeUnit.SECONDS) }
        names.edit().clear().commit()
    }

    /**
     * Resynchronise les geofences enregistrées avec celles de la base.
     * [shouldRegister] vient de GeofencePolicy : permission de localisation FINE
     * (et arrière-plan pour un déclenchement app fermée) ET alertes de zones
     * activées par le parent. Sinon, tout est désenregistré.
     *
     * [force] = true : ré-enregistrement COMPLET (après reboot). Sinon, on ne
     * re-registre QUE si l'ensemble des zones a changé (comparaison de signature) —
     * évite de retirer/ré-ajouter les geofences à chaque cycle de synchro (~5 min),
     * ce qui userait la batterie et provoquerait des pertes de transitions.
     */
    @SuppressLint("MissingPermission")
    suspend fun sync(shouldRegister: Boolean, force: Boolean = false) = withContext(Dispatchers.IO) {
        // Alertes de zones désactivées, réglage inconnu ou permissions manquantes
        // (GeofencePolicy) : on DÉSENREGISTRE
        // tout et on vide le cache, pour qu'aucune transition ne soit plus envoyée.
        if (!shouldRegister) {
            if (names.all.isNotEmpty()) {
                runCatching { Tasks.await(client.removeGeofences(pendingIntent())) }
                names.edit().clear().apply()
            }
            return@withContext
        }
        // Enrôlement capturé AVANT le réseau : l'enregistrement ne se fait que s'il
        // est toujours le courant (garde LOT 12b, même verrou que le démontage).
        val deviceId = SupervisionStore.current.value?.deviceId ?: return@withContext
        // Erreur réseau : on garde l'état actuel (ne pas confondre avec « aucune zone »).
        val zones = runCatching { repo.geofencesOrNull() }.getOrNull() ?: return@withContext
        Unenrollment.ifStillEnrolled(deviceId) { register(zones, force) }
    }

    @SuppressLint("MissingPermission")
    private fun register(zones: List<LocationRepository.Geofence>, force: Boolean) {
        val signature = zones.sortedBy { it.id }
            .joinToString("|") { "${it.id}:${it.lat},${it.lng},${it.radiusM},${it.notifyEnter},${it.notifyExit}" }
        if (!force && signature == names.getString(KEY_SIG, null)) return

        // On repart d'un état propre (retrait par PendingIntent) puis on ré-ajoute.
        runCatching { Tasks.await(client.removeGeofences(pendingIntent()), AWAIT_S, TimeUnit.SECONDS) }

        // Le cache local id→nom (instantané d'événement côté receiver, sans appel
        // réseau) et la signature ne sont écrits qu'APRÈS un enregistrement RÉUSSI :
        // sinon « mes données » et le receiver croiraient des zones actives alors
        // qu'Android les a refusées. En cas d'échec, cache vidé → nouvel essai au
        // prochain sync.
        if (zones.isEmpty()) {
            names.edit().clear().putString(KEY_SIG, signature).apply()
            return
        }

        val geofences = zones.map { z ->
            var transitions = 0
            if (z.notifyEnter) transitions = transitions or Geofence.GEOFENCE_TRANSITION_ENTER
            if (z.notifyExit) transitions = transitions or Geofence.GEOFENCE_TRANSITION_EXIT
            if (transitions == 0) transitions = Geofence.GEOFENCE_TRANSITION_ENTER
            Geofence.Builder()
                .setRequestId(z.id)
                .setCircularRegion(z.lat, z.lng, z.radiusM)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(transitions)
                .setNotificationResponsiveness(60_000)   // tolérance Doze/batterie
                .build()
        }
        val request = GeofencingRequest.Builder()
            // Pas de INITIAL_TRIGGER : on ne veut pas une fausse « arrivée » au
            // simple ré-enregistrement si l'enfant est déjà dans la zone.
            .setInitialTrigger(0)
            .addGeofences(geofences)
            .build()
        val added = runCatching {
            Tasks.await(client.addGeofences(request, pendingIntent()), AWAIT_S, TimeUnit.SECONDS)
        }.isSuccess
        val editor = names.edit().clear()
        if (added) {
            zones.forEach { editor.putString(it.id, it.name) }
            editor.putString(KEY_SIG, signature)
        }
        editor.apply()
    }

    private companion object {
        const val PREFS = "geofence_names"
        const val KEY_SIG = "_signature"
        const val AWAIT_S = 10L
    }
}
