package fr.controleparental.child.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import fr.controleparental.child.data.SupervisionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * LOT 3 — Réception des transitions de geofence (D4/D6). Chaque entrée/sortie est
 * enregistrée en base (geofence_events) ; une ENTRÉE sur une zone « bien arrivé »
 * est au bénéfice de l'enfant (le parent est rassuré). Transparent : visible dans
 * l'app enfant comme côté parent.
 */
class GeofenceBroadcastReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return
        val triggering = event.triggeringGeofences ?: return
        val transition = when (event.geofenceTransition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
            Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
            Geofence.GEOFENCE_TRANSITION_DWELL -> "dwell"
            else -> return
        }

        val store = SupervisionStore(context)
        if (!store.isEnrolled) return
        val repo = LocationRepository(store)
        val manager = GeofenceManager(context)
        // Alertes de zones désactivées depuis : une transition encore en vol n'est pas envoyée.
        if (!manager.isActive()) return

        // Travail réseau borné : on tient le receiver vivant le temps de l'insert.
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                for (g in triggering) {
                    val id = g.requestId
                    repo.insertGeofenceEvent(id, manager.nameOf(id), transition)
                }
            } finally {
                pending.finish()
            }
        }
    }
}
