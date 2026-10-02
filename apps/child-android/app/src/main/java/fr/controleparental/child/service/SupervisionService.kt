package fr.controleparental.child.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import fr.controleparental.child.MainActivity
import fr.controleparental.child.R

/**
 * Service de premier plan affichant une notification PERSISTANTE de supervision.
 *
 * Garde-fou anti-stalkerware central (voir docs/02-CONFORMITE.md) : la supervision
 * doit être VISIBLE et non masquable. Cette notification ne peut pas être balayée.
 */
class SupervisionService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIF_ID, buildNotification())
        // Planifie la collecte d'agrégats d'observation (LOT 1) : passage immédiat
        // + périodique. La collecte elle-même s'exécute dans WorkManager (repli
        // fiable sous Doze) ; le service garantit la notification de transparence.
        MetricsWorker.schedule(this)
        // START_STICKY : le système relance le service s'il est tué.
        return START_STICKY
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.supervision_channel),
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = "Indique que la supervision parentale est active." }
            nm.createNotificationChannel(channel)
        }

        val openApp = android.app.PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            android.app.PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Supervision parentale active")
            .setContentText("Tes parents t'accompagnent. Touche pour voir tes données.")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setOngoing(true)            // non balayable
            .setContentIntent(openApp)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "supervision"
        private const val NOTIF_ID = 1001

        fun start(context: Context) {
            val intent = Intent(context, SupervisionService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
