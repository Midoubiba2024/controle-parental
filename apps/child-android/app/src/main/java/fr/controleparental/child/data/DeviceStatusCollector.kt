package fr.controleparental.child.data

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs

/**
 * État de l'appareil : batterie & stockage (veille v2 — V17). Métadonnées.
 */
class DeviceStatusCollector(private val context: Context) {

    data class StatusRow(
        val batteryLevel: Int?,     // 0..100
        val isCharging: Boolean?,
        val storageTotalBytes: Long?,
        val storageFreeBytes: Long?,
    )

    fun collect(): StatusRow {
        // Batterie : lecture de l'intent sticky ACTION_BATTERY_CHANGED.
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val pct = if (level >= 0 && scale > 0) (level * 100 / scale) else null
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

        return StatusRow(
            batteryLevel = pct,
            isCharging = charging,
            storageTotalBytes = total,
            storageFreeBytes = free,
        )
    }
}
