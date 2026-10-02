package fr.controleparental.child.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.filter.LocalDnsVpnService
import fr.controleparental.child.location.LocationCoordinator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Au redémarrage de l'appareil OU après une mise à jour de l'app
 * (MY_PACKAGE_REPLACED — report L8a) :
 *  1. relance la supervision (notification persistante) — marquée `fromBoot` pour
 *     respecter les restrictions Android 14/15 sur le démarrage d'un service de
 *     premier plan depuis le boot (voir SupervisionService.onStartCommand) ;
 *  2. RELANCE le filtrage web (VpnService) s'il était activé — best-effort en mode
 *     Standard ; en device owner, le VPN always-on système l'a déjà relancé ;
 *  3. RÉ-ENREGISTRE les geofences — les geofences OS ne survivent pas au reboot
 *     (LOT 3, D4). Ceci ne dépend pas du service de premier plan (GeofencingClient
 *     fonctionne indépendamment), donc reste fiable même si le FGS est différé.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) return
        if (!SupervisionStore(context).isEnrolled) return

        SupervisionService.start(context, fromBoot = true)

        // Relance du filtrage de contenu (report L8a) — best-effort, ne plante jamais.
        runCatching { LocalDnsVpnService.restartIfDesired(context) }

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
