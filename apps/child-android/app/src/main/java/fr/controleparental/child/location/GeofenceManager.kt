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

    /**
     * Resynchronise les geofences enregistrées avec celles de la base. Nécessite
     * la permission de localisation FINE (et arrière-plan pour un déclenchement
     * app fermée). Sans permission, on ne fait rien (échec silencieux, visible via
     * l'écran « mes données »).
     */
    @SuppressLint("MissingPermission")
    suspend fun sync(hasFine: Boolean) = withContext(Dispatchers.IO) {
        if (!hasFine) return@withContext
        val zones = runCatching { repo.geofences() }.getOrDefault(emptyList())

        // On repart d'un état propre (retrait par PendingIntent) puis on ré-ajoute.
        runCatching { Tasks.await(client.removeGeofences(pendingIntent())) }

        // Met à jour le cache local id→nom (instantané d'événement côté receiver,
        // sans appel réseau). On repart propre pour oublier les zones supprimées.
        val editor = names.edit().clear()
        zones.forEach { editor.putString(it.id, it.name) }
        editor.apply()

        if (zones.isEmpty()) return@withContext

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
        runCatching { Tasks.await(client.addGeofences(request, pendingIntent())) }
    }

    private companion object {
        const val PREFS = "geofence_names"
    }
}
