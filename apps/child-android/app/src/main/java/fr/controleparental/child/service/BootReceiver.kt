package fr.controleparental.child.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import fr.controleparental.child.data.SupervisionStore

/**
 * Relance la notification de supervision après un redémarrage de l'appareil.
 * Le service ré-enregistre AUSSI les geofences au démarrage de sa boucle
 * (LocationCoordinator.onSync au premier tick) — les geofences OS ne survivent
 * pas au reboot (LOT 3, D4).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            if (SupervisionStore(context).isEnrolled) {
                SupervisionService.start(context)
            }
        }
    }
}
