package fr.controleparental.child.enforce

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioManager
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import fr.controleparental.child.R
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.service.SupervisionService
import fr.controleparental.child.data.SupervisionSignal
import fr.controleparental.child.service.Unenrollment
import fr.controleparental.child.location.LocationCoordinator

/**
 * LOT 2/3 — Applique les COMMANDES parent → enfant récupérées par PolicyClient,
 * puis les acquitte. Toutes les actions sont VISIBLES par l'enfant :
 *   * pause / lock_now  → l'overlay de pause s'affiche (via la boucle du service)
 *   * resume            → la pause est levée
 *   * ring              → l'appareil sonne (même en silencieux) — « où est le tél. »
 *   * message           → notification visible avec le message du parent
 *   * locate            → check-in de position ponctuel (LOT 3, D2) — un relevé,
 *                         remonté et visible de l'enfant (jamais occulte)
 *
 * Le verrouillage réel passe par ReinforcedEnforcer.lockNow() si l'app est admin ;
 * sinon on bascule en pause visible (overlay). L'urgence 112 reste toujours
 * joignable (l'overlay propose l'appel, aucune capture d'appel).
 */
class CommandExecutor(
    private val context: Context,
    private val cache: PolicyCache,
    private val reinforced: ReinforcedEnforcer,
    private val location: LocationCoordinator? = null,
) {
    private val store = SupervisionStore(context)
    private val policyClient = PolicyClient(store)

    suspend fun processPending() {
        // Enrôlement capturé AVANT le réseau (garde LOT 12b, voir apply()).
        val deviceId = SupervisionStore.current.value?.deviceId ?: return
        for (c in policyClient.pendingCommands()) {
            // false : état transitoire (notification de supervision pas encore
            // affichée) → la commande reste en attente, retraitée au tick suivant ;
            // l'expiration normale s'applique.
            if (apply(c, deviceId)) policyClient.ackCommand(c.id, "acked")
        }
    }

    /**
     * Notifie les nouveaux messages du parent (visible), puis accuse réception.
     *
     * TRANSPARENCE (#2) : si les notifications sont désactivées (POST_NOTIFICATIONS
     * refusée, canal coupé), on NE notifie PAS, on N'AVANCE PAS le filigrane et on
     * NE marque PAS lu → le message n'est pas perdu : l'enfant le verra dans la
     * section « Messages de mes parents » de l'écran « mes données » (repli), qui
     * posera alors l'accusé de lecture.
     * FIABILITÉ (#5) : le filigrane n'avance qu'après un markMessagesRead réussi
     * (sinon re-tenté au prochain cycle ; les IDs stables évitent les doublons).
     */
    suspend fun processMessages() {
        if (!store.isEnrolled) return
        if (!canNotify()) return
        val msgs = policyClient.newParentMessages(store.messageWatermark)
        if (msgs.isEmpty()) return
        for (m in msgs) notifyMessage(m.body, messageNotifId(m.id))
        if (policyClient.markMessagesRead(msgs.map { it.id })) {
            store.messageWatermark = msgs.last().createdAt
        }
    }

    /** Les notifications sont-elles réellement affichables (app + canal) ? */
    private fun canNotify(): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val ch = nm.getNotificationChannel(CHANNEL)
            if (ch != null && ch.importance == NotificationManager.IMPORTANCE_NONE) return false
        }
        return true
    }

    /** ID de notification STABLE par message, dans une plage disjointe de la
     *  commande `message` (#4/#8) → pas de collision ni de spam au re-sondage. */
    private fun messageNotifId(id: String): Int = MSG_NOTIF_BASE + ((id.hashCode() and 0x7fffffff) % 1000)

    /** Applique la commande ; false = ne pas l'acquitter maintenant (transitoire). */
    private suspend fun apply(c: PolicyClient.CommandRow, deviceId: String): Boolean {
        when (c.type) {
            // Écritures de cache / appels DPM : jamais après (ou pendant) un démontage.
            "pause" -> Unenrollment.ifStillEnrolled(deviceId) { cache.pauseActive = true }
            "resume" -> Unenrollment.ifStillEnrolled(deviceId) { cache.pauseActive = false }
            "lock_now" -> Unenrollment.ifStillEnrolled(deviceId) {
                if (!reinforced.lockNow()) cache.pauseActive = true
            }
            "ring" -> ring()
            "message" -> notifyMessage(c.payload.optString("message").ifBlank { context.getString(R.string.parent_message_default) }, CMD_MSG_NOTIF_ID)
            // Supervision non visible : AUCUNE position.
            //  - notifications autorisées : état transitoire (notification pas encore
            //    affichée / republiée) → pas d'acquittement, nouvel essai au tick suivant ;
            //  - notifications coupées : commande acquittée (le serveur n'autorise à
            //    l'appareil aucun statut d'échec — app.commands_guard_child_update) et
            //    parent informé par le canal device_status.
            "locate" -> if (location?.checkInOnDemand() == LocationCoordinator.CheckIn.SUPERVISION_NOT_VISIBLE) {
                if (SupervisionService.notificationsAllowed(context)) return false
                SupervisionSignal.reportNotificationsOff(context, store)
            }
        }
        return true
    }

    private fun ring() {
        runCatching {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.setStreamVolume(AudioManager.STREAM_ALARM,
                am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            RingtoneManager.getRingtone(context, uri)?.play()
        }
        runCatching {
            val vib = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 600, 300, 600), -1))
            } else {
                @Suppress("DEPRECATION") vib.vibrate(longArrayOf(0, 600, 300, 600), -1)
            }
        }
    }

    private fun notifyMessage(message: String, notifId: Int) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, context.getString(R.string.parent_messages_channel), NotificationManager.IMPORTANCE_HIGH),
            )
        }
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setContentTitle(context.getString(R.string.parent_message_title))
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setGroup(CHANNEL)
            .setAutoCancel(true)
            .build()
        nm.notify(notifId, n)
    }

    private companion object {
        const val CHANNEL = "parent_messages"
        // Plages d'ID DISJOINTES : la commande `message` (one-shot) a son ID dédié,
        // les messages sondés occupent [3000,3999] via un hash stable de leur id.
        const val CMD_MSG_NOTIF_ID = 2002
        const val MSG_NOTIF_BASE = 3000
    }
}
