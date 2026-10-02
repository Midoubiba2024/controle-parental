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
import fr.controleparental.child.data.SupervisionStore
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
        if (!store.isEnrolled) return
        for (c in policyClient.pendingCommands()) {
            apply(c)
            policyClient.ackCommand(c.id, "acked")
        }
    }

    /** Notifie les nouveaux messages du parent (visible), puis accuse réception. */
    suspend fun processMessages() {
        if (!store.isEnrolled) return
        val msgs = policyClient.newParentMessages(store.messageWatermark)
        if (msgs.isEmpty()) return
        var offset = 0
        for (m in msgs) {
            notifyMessage(m.body, MSG_NOTIF_BASE + (offset++ % 20))
        }
        store.messageWatermark = msgs.last().createdAt
        policyClient.markMessagesRead(msgs.map { it.id })
    }

    private suspend fun apply(c: PolicyClient.CommandRow) {
        when (c.type) {
            "pause" -> cache.pauseActive = true
            "resume" -> cache.pauseActive = false
            "lock_now" -> if (!reinforced.lockNow()) cache.pauseActive = true
            "ring" -> ring()
            "message" -> notifyMessage(c.payload.optString("message").ifBlank { "Message de tes parents." }, MSG_NOTIF_BASE)
            "locate" -> location?.checkInOnDemand()
        }
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
                NotificationChannel(CHANNEL, "Messages des parents", NotificationManager.IMPORTANCE_HIGH),
            )
        }
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setContentTitle("Message de tes parents")
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        nm.notify(notifId, n)
    }

    private companion object {
        const val CHANNEL = "parent_messages"
        const val MSG_NOTIF_BASE = 2002
    }
}
