package fr.controleparental.child.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import fr.controleparental.child.MainActivity
import fr.controleparental.child.R
import fr.controleparental.child.data.AppInventoryCollector
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.enforce.PolicyCache
import fr.controleparental.child.enforce.ReinforcedEnforcer
import fr.controleparental.child.filter.FilterCache
import fr.controleparental.child.filter.LocalDnsVpnService
import fr.controleparental.child.location.GeofenceManager
import fr.controleparental.child.safety.SafetyCache
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Démontage CENTRALISÉ et IDEMPOTENT après un désenrôlement (session perdue,
 * appareil retiré par le parent — docs/14-APPAIRAGE.md §4–§5).
 *
 * 🔴 Transparence (docs/02-CONFORMITE.md) : aucune restriction ne doit survivre à
 * la notification de supervision. Ordre : (1) levée de TOUTES les restrictions et
 * effacement des caches, (2) notification visible expliquant ce qui s'est passé,
 * (3) arrêt du service de supervision (sa notification disparaît en dernier).
 *
 * Indépendant de la boucle du service : lancé par [SupervisionStore.unenroll]
 * quel que soit l'appelant, et rejoué (drapeau « démontage en attente », écrit
 * dans le même commit que l'effacement) au démarrage de l'appli et au boot si le
 * processus a été tué en cours de route.
 *
 * Hors périmètre (point ouvert) : le statut device owner lui-même n'est pas retiré.
 */
object Unenrollment {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()

    /** Lance le démontage en tâche de fond (n'attend pas). */
    fun releaseAsync(context: Context, reason: SupervisionStore.UnenrollReason?) {
        val app = context.applicationContext ?: context
        scope.launch { release(app, reason) }
    }

    /**
     * Filet de sécurité (démarrage de l'appli, boot) : rejoue le démontage s'il a
     * été interrompu. Ne fait rien pour un appareil enrôlé ou jamais désenrôlé.
     */
    fun resumeIfPending(context: Context) {
        val app = context.applicationContext ?: context
        scope.launch { resumeIfPendingNow(app) }
    }

    /** Variante bloquante du filet (BroadcastReceiver avec goAsync). */
    suspend fun resumeIfPendingNow(context: Context) {
        val store = runCatching { SupervisionStore(context) }.getOrNull() ?: return
        if (!store.isEnrolled && store.teardownPending) release(context, null)
    }

    /**
     * Exécute [block] SEULEMENT si l'enrôlement [deviceId] (capturé AVANT les appels
     * réseau) est toujours le courant, sous le MÊME verrou que [release] : une
     * synchro en vol ne peut plus réappliquer une restriction, réécrire un cache
     * ou réenregistrer un géorepère après (ou pendant) le démontage. null sinon.
     * [block] ne doit ni suspendre ni rappeler [Unenrollment].
     */
    suspend fun <T> ifStillEnrolled(deviceId: String, block: () -> T): T? = mutex.withLock {
        if (SupervisionStore.current.value?.deviceId == deviceId) block() else null
    }

    /**
     * Exécute [block] en exclusion mutuelle avec le démontage (appairage) : un
     * appairage ne peut pas aboutir PENDANT un démontage, et inversement.
     */
    suspend fun <T> exclusive(block: () -> T): T = mutex.withLock { block() }

    /** [reason] null = reprise du filet (la notification a déjà pu être publiée). */
    suspend fun release(context: Context, reason: SupervisionStore.UnenrollReason?) = mutex.withLock {
        val store = runCatching { SupervisionStore(context) }.getOrNull() ?: return@withLock
        // Ré-appairé entre-temps : ne surtout rien démonter.
        if (store.isEnrolled) return@withLock
        // Reprise en double (filet déjà passé) : rien à refaire.
        if (reason == null && !store.teardownPending) return@withLock

        // 1. Restrictions système (device owner) : suspensions, verrou des réglages, VPN always-on.
        runCatching { releaseDeviceOwnerRestrictions(context) }
        // 2. Filtrage DNS : arrêt du tunnel (le service vide aussi son journal en attente).
        if (LocalDnsVpnService.isRunning) runCatching { LocalDnsVpnService.stop(context) }
        // 3. Géorepères de l'ancien enfant.
        runCatching { GeofenceManager(context).removeAll() }
        // 4. Caches de règles, de filtrage et de bien-être (jamais réutilisés pour un autre enfant).
        runCatching { PolicyCache(context).clear() }
        runCatching { FilterCache(context).clear() }
        runCatching { SafetyCache(context).clear() }
        // 4 bis. Plus aucune collecte planifiée (périodique et ponctuelle).
        runCatching { MetricsWorker.cancel(context) }
        // 5. Information visible, puis arrêt de la supervision (overlay masqué à l'arrêt).
        val shown = reason ?: SupervisionStore.unenrolled.value
        if (shown != null) runCatching { notifyUnenrolled(context, shown) }
        runCatching { SupervisionService.stop(context) }

        store.teardownPending = false
    }

    private fun releaseDeviceOwnerRestrictions(context: Context) {
        val enforcer = ReinforcedEnforcer(context)
        if (!enforcer.isDeviceOwner()) return
        // Lever la suspension de TOUT paquet connu (lançables + visibles), pas
        // seulement ceux des dernières règles : idempotent si rien n'est suspendu.
        val packages = buildSet {
            runCatching { AppInventoryCollector(context).collect().forEach { add(it.packageName) } }
            runCatching {
                @Suppress("QueryPermissionsNeeded")
                context.packageManager.getInstalledPackages(0).forEach { add(it.packageName) }
            }
            remove(context.packageName)
        }
        enforcer.applySuspensions(emptyList(), packages)
        enforcer.setSystemSettingsLock(false)
        enforcer.setAlwaysOnVpn(false)
    }

    private fun notifyUnenrolled(context: Context, reason: SupervisionStore.UnenrollReason) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    context.getString(R.string.unenroll_channel),
                    NotificationManager.IMPORTANCE_DEFAULT,
                ),
            )
        }
        val text = context.getString(
            when (reason) {
                SupervisionStore.UnenrollReason.SESSION_LOST -> R.string.pairing_session_expired
                SupervisionStore.UnenrollReason.DEVICE_REVOKED -> R.string.pairing_device_revoked
            },
        )
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(context.getString(R.string.unenroll_notification_title))
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(NOTIF_ID, n)
    }

    private const val CHANNEL_ID = "pairing_status"
    private const val NOTIF_ID = 2010
}
