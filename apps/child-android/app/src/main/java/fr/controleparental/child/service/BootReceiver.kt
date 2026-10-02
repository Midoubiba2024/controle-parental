package fr.controleparental.child.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.location.LocationCoordinator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Au redémarrage de l'appareil :
 *  1. relance la supervision (notification persistante) — marquée `fromBoot` pour
 *     respecter les restrictions Android 14/15 sur le démarrage d'un service de
 *     premier plan depuis le boot (voir SupervisionService.onStartCommand) ;
 *  2. RÉ-ENREGISTRE les geofences — les geofences OS ne survivent pas au reboot
 *     (LOT 3, D4). Ceci ne dépend pas du service de premier plan (GeofencingClient
 *     fonctionne indépendamment), donc reste fiable même si le FGS est différé.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!SupervisionStore(context).isEnrolled) return

        SupervisionService.start(context, fromBoot = true)

        // Ré-enregistrement des geofences, borné dans le temps par le receiver.
        val appContext = context.applicationContext
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                LocationCoordinator(appContext).registerGeofencesAfterBoot()
            } finally {
                pending.finish()
            }
        }
    }
}
