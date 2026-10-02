package fr.controleparental.child.safety

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import fr.controleparental.child.Config
import fr.controleparental.child.data.SupervisionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

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
 *     de confidentialité (K8). Tant qu'aucune config fiable n'est connue, on
 *     N'ANALYSE PAS (défaut protecteur).
 *
 * Perf/robustesse (retours de revue) :
 *   * #7 — `onNotificationPosted` ne décide que sur un INSTANTANÉ @Volatile en
 *     mémoire ; aucune lecture/déchiffrement d'EncryptedSharedPreferences sur le
 *     thread de callback. L'instantané est rafraîchi en tâche de fond (IO).
 *   * #2 — on ignore les RÉSUMÉS de groupe (FLAG_GROUP_SUMMARY) et les reposts
 *     inchangés (même key + postTime) → pas de signaux dupliqués ni de compteur gonflé.
 */
class SafetyNotificationListener : NotificationListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val store by lazy { SupervisionStore(applicationContext) }
    private val cache by lazy { SafetyCache(applicationContext) }
    private val client by lazy { SafetyClient(store) }

    // Instantané de décision (mémoire) — jamais lu depuis les prefs sur le callback.
    @Volatile private var snapEnrolled = false
    @Volatile private var snapActive = false   // consentement + profil ado
    @Volatile private var snapPaused = false   // pause de confidentialité (K8)
    @Volatile private var snapSynced = false   // une config fiable a été obtenue
    @Volatile private var lastRefreshAt = 0L
    @Volatile private var syncing = false

    // Déduplication des reposts : key → dernier postTime traité (borné).
    private val lastSeen = ConcurrentHashMap<String, Long>()

    override fun onListenerConnected() {
        super.onListenerConnected()
        if (!Config.featureSafetySignals) return
        snapEnrolled = store.isEnrolled
        if (!snapEnrolled) return
        scope.launch {
            client.syncSettings(cache)
            applySnapshot()
            lastRefreshAt = System.currentTimeMillis()
            client.reportStatus(snapActive && !snapPaused)
        }
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        // L'ado (ou le système) a retiré l'accès : rendre l'arrêt VISIBLE au parent.
        if (store.isEnrolled) scope.launch { client.reportStatus(false) }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (!Config.featureSafetySignals || sbn == null || !snapEnrolled) return
        val n = sbn.notification ?: return
        // #2 — ignorer les résumés de groupe (pas un vrai message).
        if ((n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
        // Ne jamais s'analyser soi-même.
        if (sbn.packageName == applicationContext.packageName) return
        // #2 — repost inchangé (même key + postTime) → ignorer.
        val key = sbn.key ?: sbn.packageName
        if (lastSeen.put(key, sbn.postTime) == sbn.postTime) return
        if (lastSeen.size > MAX_SEEN) lastSeen.clear()

        // Rafraîchir l'instantané si périmé (asynchrone, en mémoire — pas de prefs ici).
        maybeRefreshSnapshot()

        // Défaut protecteur : pas de config fiable, non consenti/gradué, ou en pause → rien.
        if (!snapSynced || !snapActive || snapPaused) return

        // Extraction du texte EN MÉMOIRE (variable locale, jamais loggée/persistée).
        val text = extractText(n) ?: return
        val signals = SafetyDetectionEngine.analyze(text, sbn.packageName)
        // `text` sort de portée ici : aucune trace. Seuls les signaux remontent.
        if (signals.isEmpty()) return
        val sourceApp = sbn.packageName
        scope.launch { client.reportSignals(signals, sourceApp) }
    }

    /** Recopie l'état du cache (déjà rafraîchi sur IO) dans l'instantané mémoire. */
    private fun applySnapshot() {
        snapActive = cache.toConfig().active
        snapPaused = cache.pauseActive
        snapSynced = !cache.neverSynced
    }

    private fun maybeRefreshSnapshot() {
        val now = System.currentTimeMillis()
        if (now - lastRefreshAt > SETTINGS_TTL_MS && !syncing) {
            lastRefreshAt = now
            syncing = true
            scope.launch {
                try {
                    client.syncSettings(cache)
                    applySnapshot()
                } finally { syncing = false }
            }
        }
    }

    /**
     * Concatène les champs texte de la notification, y compris les styles Messaging
     * (EXTRA_MESSAGES) et Inbox (EXTRA_TEXT_LINES) — les plus récents seulement
     * (#8). ⚠️ Le texte reste STRICTEMENT local (jamais loggé/persisté/envoyé).
     * Retourne null si vide.
     */
    private fun extractText(n: Notification): String? {
        val extras = n.extras ?: return null
        val sb = StringBuilder()
        extras.getCharSequence(Notification.EXTRA_TITLE)?.let { sb.append(it).append(' ') }
        extras.getCharSequence(Notification.EXTRA_TEXT)?.let { sb.append(it).append(' ') }
        extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.let { sb.append(it).append(' ') }
        extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.let { sb.append(it).append(' ') }
        // MessagingStyle (WhatsApp, Messages…) : le(s) message(s) le(s) plus récent(s).
        runCatching {
            NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
        }.getOrNull()?.messages?.let { msgs ->
            for (m in msgs.takeLast(RECENT_MESSAGES)) m.text?.let { sb.append(it).append(' ') }
        }
        // InboxStyle : lignes les plus récentes.
        extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.let { lines ->
            for (l in lines.takeLast(RECENT_MESSAGES)) sb.append(l).append(' ')
        }
        val text = sb.toString().trim()
        return text.ifBlank { null }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val SETTINGS_TTL_MS = 2 * 60 * 1000L // 2 min
        private const val RECENT_MESSAGES = 3
        private const val MAX_SEEN = 500

        /** L'accès aux notifications est-il accordé à notre app ? (pour l'UI). */
        fun isEnabled(context: Context): Boolean =
            NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }
}
