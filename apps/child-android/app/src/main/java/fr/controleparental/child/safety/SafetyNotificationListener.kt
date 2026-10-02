package fr.controleparental.child.safety

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationManagerCompat
import fr.controleparental.child.Config
import fr.controleparental.child.data.SupervisionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * LOT 6 — Écoute des notifications pour une analyse de risque STRICTEMENT ON-DEVICE.
 *
 * Le système lie ce service UNIQUEMENT quand l'ado a accordé l'accès aux
 * notifications (Réglages → Accès aux notifications) ; on ne le force jamais.
 *
 * 🔴🔴 LIGNE ROUGE (docs/11-LOT6-BIEN-ETRE.md, docs/02-CONFORMITE.md §G) :
 *   * Le texte de la notification est extrait en MÉMOIRE, passé au moteur PUR
 *     [SafetyDetectionEngine] SUR L'APPAREIL, puis abandonné (hors de portée → GC).
 *   * Il n'est JAMAIS journalisé (aucun Log du contenu), persisté, mis en cache, ni
 *     inclus dans une charge réseau. SEULS des SIGNAUX de métadonnées
 *     (catégorie/gravité/compteur/app) sont remontés via [SafetyClient].
 *   * Triple garde runtime : flag de build, profil preteen/teen (jamais
 *     young_child), consentement `safety_settings.analysis_enabled`. Plus la pause
 *     de confidentialité (K8). En l'absence de config fiable, on N'ANALYSE PAS
 *     (défaut protecteur).
 */
class SafetyNotificationListener : NotificationListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val store by lazy { SupervisionStore(applicationContext) }
    private val cache by lazy { SafetyCache(applicationContext) }
    private val client by lazy { SafetyClient(store) }

    @Volatile private var syncing = false

    override fun onListenerConnected() {
        super.onListenerConnected()
        if (!Config.featureSafetySignals || !store.isEnrolled) return
        scope.launch {
            client.syncSettings(cache)
            // L'analyse est active si consentie + profil ado + pas de pause.
            client.reportStatus(cache.toConfig().active && !cache.pauseActive)
        }
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        // L'ado a (ou le système a) retiré l'accès : rendre l'arrêt VISIBLE au parent.
        if (store.isEnrolled) scope.launch { client.reportStatus(false) }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (!Config.featureSafetySignals || sbn == null || !store.isEnrolled) return
        // Ne jamais s'analyser soi-même (notification de supervision, etc.).
        if (sbn.packageName == applicationContext.packageName) return

        // Rafraîchir la config si périmée (asynchrone, non bloquant).
        maybeRefreshSettings()

        // Défaut protecteur : tant qu'aucune config fiable n'a été synchronisée, ou
        // que l'analyse n'est pas consentie/graduée, ou qu'une pause est active, on
        // n'analyse RIEN.
        if (cache.neverSynced) return
        if (!cache.toConfig().active || cache.pauseActive) return

        // Extraction du texte EN MÉMOIRE (variable locale, jamais loggée/persistée).
        val text = extractText(sbn.notification) ?: return
        val signals = SafetyDetectionEngine.analyze(text, sbn.packageName)
        // `text` sort de portée ici : aucune trace. Seuls les signaux remontent.
        if (signals.isEmpty()) return
        val sourceApp = sbn.packageName
        scope.launch { client.reportSignals(signals, sourceApp) }
    }

    private fun maybeRefreshSettings() {
        val stale = System.currentTimeMillis() - cache.lastSyncAt > SETTINGS_TTL_MS
        if ((cache.neverSynced || stale) && !syncing) {
            syncing = true
            scope.launch {
                try { client.syncSettings(cache) } finally { syncing = false }
            }
        }
    }

    /** Concatène les champs texte de la notification. Retourne null si vide. */
    private fun extractText(notification: Notification?): String? {
        val extras = notification?.extras ?: return null
        val sb = StringBuilder()
        extras.getCharSequence(Notification.EXTRA_TITLE)?.let { sb.append(it).append(' ') }
        extras.getCharSequence(Notification.EXTRA_TEXT)?.let { sb.append(it).append(' ') }
        extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.let { sb.append(it).append(' ') }
        extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.let { sb.append(it).append(' ') }
        val text = sb.toString().trim()
        return text.ifBlank { null }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val SETTINGS_TTL_MS = 2 * 60 * 1000L // 2 min

        /** L'accès aux notifications est-il accordé à notre app ? (pour l'UI). */
        fun isEnabled(context: Context): Boolean =
            NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }
}
