package fr.controleparental.child.data

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * État de l'appareil : batterie & stockage (veille v2 — V17) + état des PERMISSIONS
 * clés (LOT 8b : signalement transparent du retrait d'une autorisation). Métadonnées
 * uniquement — jamais de contenu.
 */
class DeviceStatusCollector(private val context: Context) {

    data class StatusRow(
        val batteryLevel: Int?,     // 0..100
        val isCharging: Boolean?,
        val storageTotalBytes: Long?,
        val storageFreeBytes: Long?,
        // État des protections (true=accordée, false=révoquée). Remonté pour que le
        // parent voie, en toute transparence, qu'une protection est désactivée.
        val permUsageAccess: Boolean?,
        val permOverlay: Boolean?,
        val permNotifications: Boolean?,
        val permLocation: Boolean?,
    )

    fun collect(): StatusRow {
        // Batterie : lecture de l'intent sticky ACTION_BATTERY_CHANGED.
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        // Borne à 0..100 : certains OEM remontent un ratio > 1 (ou scale incohérent),
        // ce qui violerait la contrainte CHECK (battery_level 0..100) et ferait
        // échouer l'insert de façon PERMANENTE (voir MetricsWorker).
        val pct = if (level >= 0 && scale > 0) (level * 100 / scale).coerceIn(0, 100) else null
        val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val charging = when (status) {
            BatteryManager.BATTERY_STATUS_CHARGING, BatteryManager.BATTERY_STATUS_FULL -> true
            BatteryManager.BATTERY_STATUS_DISCHARGING, BatteryManager.BATTERY_STATUS_NOT_CHARGING -> false
            else -> null
        }

        // Stockage interne (partition de données).
        val stat = StatFs(Environment.getDataDirectory().path)
        val total = stat.blockCountLong * stat.blockSizeLong
        val free = stat.availableBlocksLong * stat.blockSizeLong

        // État des permissions clés (best-effort — chaque lecture est protégée).
        val permUsage = runCatching { UsageStatsCollector(context).hasUsageAccess() }.getOrNull()
        val permOverlay = runCatching { Settings.canDrawOverlays(context) }.getOrNull()
        val permNotif = runCatching { NotificationManagerCompat.from(context).areNotificationsEnabled() }.getOrNull()
        val permLoc = runCatching {
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        }.getOrNull()

        return StatusRow(
            batteryLevel = pct,
            isCharging = charging,
            storageTotalBytes = total,
            storageFreeBytes = free,
            permUsageAccess = permUsage,
            permOverlay = permOverlay,
            permNotifications = permNotif,
            permLocation = permLoc,
        )
    }
}
