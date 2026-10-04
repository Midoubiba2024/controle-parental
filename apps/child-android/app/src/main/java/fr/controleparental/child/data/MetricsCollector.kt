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
        // Jamais rien d'antérieur à l'appairage (LOT 12b, minimisation).
        // … ni de la période où la supervision n'était pas visible (T2, échec fermé).
        val notBefore = CollectionWindows.notBefore(store.enrolledAt, store.visibleSince)
        val usage = UsageStatsCollector(context).collect(daysBack = 3, notBefore = notBefore)
        val ids = BatchRows.base(e.familyId, e.childId, e.deviceId)
        // Un upsert PAR JEU DE CLÉS : une colonne facultative inconnue est retirée
        // (pas d'écrasement par NULL) sans casser l'homogénéité du lot (PGRST102).
        for (group in BatchRows.groupByKeys(usage.map { BatchRows.usage(ids, it) })) {
            val res = client.upsert(
                "usage_daily", BatchRows.toJsonArray(group), onConflict = "child_id,device_id,day,package_name",
            )
            if (res is SupabaseClient.Result.Error) errors += "usage:${res.code}"
        }

        // 2) Inventaire des apps installées.
        val inventory = AppInventoryCollector(context).collect()
        val seenAt = System.currentTimeMillis()
        var inventoryOk = true
        for (group in BatchRows.groupByKeys(inventory.map { BatchRows.inventory(ids, it, seenAt) })) {
            val res = client.upsert(
                "app_inventory", BatchRows.toJsonArray(group), onConflict = "child_id,device_id,package_name",
            )
            if (res is SupabaseClient.Result.Error) { errors += "inventory:${res.code}"; inventoryOk = false }
        }

        // Réconciliation : stamper removed_at pour les packages encore en base
        // (non déjà marqués) mais ABSENTS de l'inventaire courant → apps
        // désinstallées. Sinon elles resteraient affichées « à vie » côté parent.
        // On ne le fait qu'après un upsert réussi et si l'inventaire n'est pas
        // vide (une collecte vide, ex. erreur, ne doit pas tout marquer supprimé).
        // TOUS les sous-lots doivent avoir réussi : sinon des apps présentes seraient
        // marquées désinstallées.
        if (inventoryOk && inventory.isNotEmpty()) {
            val present = inventory.joinToString(",") { it.packageName }
            val query = "child_id=eq.${e.childId}" +
                "&device_id=eq.${e.deviceId}" +
                "&removed_at=is.null" +
                "&package_name=not.in.($present)"
            val reconciled = client.patch(
                "app_inventory", query,
                JSONObject().put("removed_at", iso(System.currentTimeMillis())),
            )
            if (reconciled is SupabaseClient.Result.Error) errors += "inventory_reconcile:${reconciled.code}"
        }

        // 3) Journal d'appels (métadonnées), seulement si la fonction est activée.
        //    CONFORMITÉ : aucun nom de contact — numéro haché, sens, durée, date.
        var callCount = 0
        val callCollector = CallLogCollector(context)
        if (callCollector.isEnabledAndGranted()) {
            val since = CollectionWindows.callsSince(store.callLogWatermark, notBefore)
            val calls = callCollector.collect(since)
            // counterparty_hash null (appel anonyme) reste une clé PRÉSENTE (PGRST102).
            val callArr = BatchRows.toJsonArray(calls.map { BatchRows.call(ids, it) })
            val maxTs = calls.maxOfOrNull { it.occurredAt }?.coerceAtLeast(since) ?: since
            val res = client.upsert(
                "comm_events", callArr,
                onConflict = "device_id,occurred_at,counterparty_hash,direction",
                ignoreDuplicates = true,
            )
            if (res is SupabaseClient.Result.Error) errors += "calls:${res.code}"
            else { store.callLogWatermark = maxTs; callCount = calls.size }
        }

        // 4) Batterie & stockage — EN DERNIER, et seulement si le reste du cycle a
        //    réussi. IDEMPOTENCE : on réutilise le captured_at en attente (filigrane)
        //    tant que l'upload n'a pas abouti, et on upsert sur (device_id,
        //    captured_at) en ignore-duplicates (migration 0009). Ainsi une réponse
        //    perdue puis ré-émise au rejeu ne crée PAS de doublon. (La purge de
        //    rétention de device_status est planifiée en L8.)
        var statusOk = false
        if (errors.isEmpty()) {
            val status = DeviceStatusCollector(context).collect()
            val capturedAt = store.pendingStatusCapturedAt.takeIf { it != 0L }
                ?: System.currentTimeMillis()
            store.pendingStatusCapturedAt = capturedAt
            val statusArr = JSONArray().put(
                base(e).apply {
                    put("battery_level", status.batteryLevel ?: JSONObject.NULL)
                    put("is_charging", status.isCharging ?: JSONObject.NULL)
                    put("storage_total_bytes", status.storageTotalBytes ?: JSONObject.NULL)
                    put("storage_free_bytes", status.storageFreeBytes ?: JSONObject.NULL)
                    put("perm_usage_access", status.permUsageAccess ?: JSONObject.NULL)
                    put("perm_overlay", status.permOverlay ?: JSONObject.NULL)
                    put("perm_notifications", status.permNotifications ?: JSONObject.NULL)
                    put("perm_location", status.permLocation ?: JSONObject.NULL)
                    put("captured_at", iso(capturedAt))
                },
            )
            when (val res = client.upsert(
                "device_status", statusArr,
                onConflict = "device_id,captured_at", ignoreDuplicates = true,
            )) {
                is SupabaseClient.Result.Error -> errors += "status:${res.code}"
                else -> { statusOk = true; store.pendingStatusCapturedAt = 0L }
            }
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
