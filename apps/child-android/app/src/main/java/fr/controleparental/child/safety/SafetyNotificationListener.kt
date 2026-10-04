package fr.controleparental.child.safety

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import fr.controleparental.child.Config
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.service.SupervisionService
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
    // L'enrôlement courant se lit dans SupervisionStore.current (mémoire, sans
    // déchiffrement) ; [snapDeviceId] = ENRÔLEMENT pour lequel la config a été
    // synchronisée AVEC SUCCÈS. Chaque appairage crée un nouveau device_id : même
    // le ré-appairage du MÊME enfant exige une nouvelle synchro du consentement
    // avant toute analyse (LOT 12b).
    @Volatile private var snapDeviceId: String? = null
    // Instant d'appairage (mis en mémoire à la synchro, jamais lu des prefs sur le
    // callback) : aucun message antérieur n'est analysé (NotificationText).
    @Volatile private var snapEnrolledAt = Long.MAX_VALUE
    // Clés des notifications DÉJÀ présentes avant l'appairage (T3) : une
    // notification cumulative (Inbox, BigText) republiée ensuite contient
    // d'anciens messages non datés → jamais analysée hors MessagingStyle.
    // Rempli sur IO (syncSnapshot), vidé au changement d'enrôlement.
    private val preEnrollmentKeys: MutableSet<String> = ConcurrentHashMap.newKeySet()
    @Volatile private var preEnrollmentKeysFor: String? = null
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
        // Construit le store : initialise SupervisionStore.current dans ce processus.
        if (!runCatching { store.isEnrolled }.getOrDefault(false)) return
        scope.launch {
            syncSnapshot()
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
        if (!Config.featureSafetySignals || sbn == null) return
        val current = SupervisionStore.current.value ?: return
        // Aucune analyse sans notification de supervision visible (LOT 12b).
        if (!SupervisionService.supervisionVisible(applicationContext)) return
        val n = sbn.notification ?: return
        // #2 — ignorer les résumés de groupe (pas un vrai message).
        if ((n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
        // Ne jamais s'analyser soi-même.
        if (sbn.packageName == applicationContext.packageName) return
        // #2 — repost inchangé (même key + postTime) → ignorer.
        val key = sbn.key ?: sbn.packageName
        if (lastSeen.put(key, sbn.postTime) == sbn.postTime) return
        if (lastSeen.size > MAX_SEEN) lastSeen.clear()

        // Config synchronisée pour un AUTRE enrôlement (ou jamais) : resynchroniser,
        // et ne rien analyser d'ici là.
        val sameEnrollment = snapDeviceId == current.deviceId
        // Rafraîchir l'instantané si périmé (asynchrone, en mémoire — pas de prefs ici).
        maybeRefreshSnapshot(force = !sameEnrollment)

        // Défaut protecteur : pas de config fiable pour CET enfant, non
        // consenti/gradué, ou en pause → rien.
        if (!sameEnrollment || !snapSynced || !snapActive || snapPaused) return

        // Extraction du texte EN MÉMOIRE (variable locale, jamais loggée/persistée).
        val text = extractText(n, sbn.postTime, presentBefore = sbn.key in preEnrollmentKeys) ?: return
        val signals = SafetyDetectionEngine.analyze(text, sbn.packageName)
        // `text` sort de portée ici : aucune trace. Seuls les signaux remontent.
        if (signals.isEmpty()) return
        val sourceApp = sbn.packageName
        scope.launch {
            // Dernière garde avant envoi : toujours le même enfant enrôlé.
            if (SupervisionStore.current.value?.deviceId == current.deviceId) client.reportSignals(signals, sourceApp)
        }
    }

    /** Recopie l'état du cache (déjà rafraîchi sur IO) dans l'instantané mémoire. */
    private fun applySnapshot() {
        snapEnrolledAt = runCatching { store.enrolledAt }.getOrDefault(Long.MAX_VALUE)
        snapActive = cache.toConfig().active
        snapPaused = cache.pauseActive
        snapSynced = !cache.neverSynced
    }

    /**
     * Synchronise la config puis l'instantané. [snapDeviceId] ne prend la valeur
     * de l'enrôlement courant qu'après une synchro RÉUSSIE pour lui (gardes connues).
     */
    private suspend fun syncSnapshot() {
        val deviceId = SupervisionStore.current.value?.deviceId
        client.syncSettings(cache)
        applySnapshot()
        // Les gardes en cache doivent avoir été synchronisées pour CET enrôlement
        // (SafetyCache.syncedDeviceId, écrit seulement si consentement ET profil
        // sont connus) — une synchro partielle ou celle d'un autre appairage ne suffit pas.
        val synced = if (
            deviceId != null &&
            SupervisionStore.current.value?.deviceId == deviceId &&
            cache.syncedDeviceId == deviceId
        ) deviceId else null
        // Clés antérieures recensées AVANT d'autoriser l'analyse pour cet enrôlement.
        refreshPreEnrollmentKeys(deviceId)
        snapDeviceId = synced
    }

    /** Recense les notifications présentes publiées AVANT l'appairage (T3). */
    private fun refreshPreEnrollmentKeys(deviceId: String?) {
        if (deviceId != preEnrollmentKeysFor) {
            preEnrollmentKeys.clear()
            preEnrollmentKeysFor = deviceId
        }
        if (deviceId == null) return
        val enrolledAt = snapEnrolledAt
        runCatching { activeNotifications }.getOrNull()?.forEach { sbn ->
            if (sbn.postTime < enrolledAt) sbn.key?.let { preEnrollmentKeys.add(it) }
        }
    }

    private fun maybeRefreshSnapshot(force: Boolean = false) {
        val now = System.currentTimeMillis()
        val age = now - lastRefreshAt
        // Forcé (enfant différent) : au plus toutes les 30 s, pour ne jamais
        // enchaîner les requêtes à chaque notification si le réseau échoue.
        if (((force && age > FORCED_REFRESH_MIN_MS) || age > SETTINGS_TTL_MS) && !syncing) {
            lastRefreshAt = now
            syncing = true
            scope.launch {
                try {
                    syncSnapshot()
                } finally { syncing = false }
            }
        }
    }

    /**
     * Texte de la notification à analyser (Messaging, Inbox, champs simples),
     * borné à l'appairage par [NotificationText] : aucun message reçu avant
     * l'appairage n'est analysé (LOT 12b). ⚠️ Le texte reste STRICTEMENT local
     * (jamais loggé/persisté/envoyé). Retourne null s'il ne reste rien.
     */
    private fun extractText(n: Notification, postTime: Long, presentBefore: Boolean): String? {
        val extras = n.extras ?: return null
        // MessagingStyle (WhatsApp, Messages…) : messages datés, filtrés à l'appairage.
        val messages = runCatching {
            NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
        }.getOrNull()?.messages?.map { NotificationText.Message(it.timestamp, it.text) }
        return NotificationText.assemble(
            title = extras.getCharSequence(Notification.EXTRA_TITLE),
            text = extras.getCharSequence(Notification.EXTRA_TEXT),
            bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT),
            subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT),
            messages = messages,
            inboxLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.toList(),
            postTime = postTime,
            enrolledAt = snapEnrolledAt,
            recent = RECENT_MESSAGES,
            presentBeforeEnrollment = presentBefore,
        )
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val SETTINGS_TTL_MS = 2 * 60 * 1000L // 2 min
        private const val FORCED_REFRESH_MIN_MS = 30_000L
        private const val RECENT_MESSAGES = 3
        private const val MAX_SEEN = 500

        /** L'accès aux notifications est-il accordé à notre app ? (pour l'UI). */
        fun isEnabled(context: Context): Boolean =
            NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }
}
