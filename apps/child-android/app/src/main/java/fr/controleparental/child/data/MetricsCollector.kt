package fr.controleparental.child.data

import android.content.Context
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

/**
 * Orchestration de la collecte d'OBSERVATION (LOT 1) et de la remontée chiffrée
 * des AGRÉGATS vers Supabase. Jamais de contenu : temps d'écran agrégé,
 * inventaire d'apps, batterie/stockage, métadonnées d'appels (si activé).
 */
class MetricsCollector(private val context: Context) {

    private val store = SupervisionStore(context)
    private val client = SupabaseClient(store)

    data class Report(
        val usageRows: Int = 0,
        val inventoryRows: Int = 0,
        val statusWritten: Boolean = false,
        val callRows: Int = 0,
        val errors: List<String> = emptyList(),
    )

    suspend fun collectAndUpload(): Report {
        val e = store.load() ?: return Report(errors = listOf("not_enrolled"))
        val errors = mutableListOf<String>()

        // 1) Temps d'écran (agrégat par app/jour).
        val usage = UsageStatsCollector(context).collect(daysBack = 3)
        val usageArr = JSONArray()
        usage.forEach { r ->
            usageArr.put(
                base(e).apply {
                    put("day", r.day)
                    put("package_name", r.packageName)
                    putOpt("app_label", r.appLabel)
                    putOpt("category", r.category)
                    put("total_foreground_ms", r.totalForegroundMs)
                    put("launch_count", r.launchCount)
                    put("last_used_at", iso(r.lastUsedAt))
                },
            )
        }
        when (val res = client.upsert(
            "usage_daily", usageArr, onConflict = "child_id,device_id,day,package_name",
        )) { is SupabaseClient.Result.Error -> errors += "usage:${res.code}"; else -> {} }

        // 2) Inventaire des apps installées.
        val inventory = AppInventoryCollector(context).collect()
        val invArr = JSONArray()
        inventory.forEach { r ->
            invArr.put(
                base(e).apply {
                    put("package_name", r.packageName)
                    putOpt("app_label", r.appLabel)
                    putOpt("category", r.category)
                    put("is_system", r.isSystem)
                    putOpt("installed_at", r.installedAt?.let { iso(it) })
                    put("last_seen_at", iso(System.currentTimeMillis()))
                },
            )
        }
        when (val res = client.upsert(
            "app_inventory", invArr, onConflict = "child_id,device_id,package_name",
        )) { is SupabaseClient.Result.Error -> errors += "inventory:${res.code}"; else -> {} }

        // 3) Batterie & stockage.
        val status = DeviceStatusCollector(context).collect()
        val statusArr = JSONArray().put(
            base(e).apply {
                putOpt("battery_level", status.batteryLevel)
                putOpt("is_charging", status.isCharging)
                putOpt("storage_total_bytes", status.storageTotalBytes)
                putOpt("storage_free_bytes", status.storageFreeBytes)
                put("captured_at", iso(System.currentTimeMillis()))
            },
        )
        val statusOk = client.upsert("device_status", statusArr) !is SupabaseClient.Result.Error
        if (!statusOk) errors += "status"

        // 4) Journal d'appels (métadonnées), seulement si la fonction est activée.
        var callCount = 0
        val callCollector = CallLogCollector(context)
        if (callCollector.isEnabledAndGranted()) {
            val since = store.callLogWatermark
            val calls = callCollector.collect(since)
            val callArr = JSONArray()
            var maxTs = since
            calls.forEach { r ->
                callArr.put(
                    base(e).apply {
                        put("kind", "call")
                        put("direction", r.direction)
                        putOpt("counterparty_hash", r.counterpartyHash)
                        putOpt("counterparty_label", r.counterpartyLabel)
                        put("duration_ms", r.durationMs)
                        put("occurred_at", iso(r.occurredAt))
                    },
                )
                if (r.occurredAt > maxTs) maxTs = r.occurredAt
            }
            val res = client.upsert(
                "comm_events", callArr,
                onConflict = "device_id,occurred_at,counterparty_hash,direction",
                ignoreDuplicates = true,
            )
            if (res is SupabaseClient.Result.Error) errors += "calls:${res.code}"
            else { store.callLogWatermark = maxTs; callCount = calls.size }
        }

        return Report(usage.size, inventory.size, statusOk, callCount, errors)
    }

    /** Colonnes communes (identité famille/enfant/appareil) pour chaque ligne. */
    private fun base(e: SupervisionStore.Enrollment): JSONObject = JSONObject()
        .put("family_id", e.familyId)
        .put("child_id", e.childId)
        .put("device_id", e.deviceId)

    private fun iso(epochMs: Long): String = Instant.ofEpochMilli(epochMs).toString()
}
