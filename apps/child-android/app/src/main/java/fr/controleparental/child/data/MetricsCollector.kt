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
                    // App présente : on « ressuscite » une entrée éventuellement
                    // marquée désinstallée (removed_at remis à null au merge).
                    put("removed_at", JSONObject.NULL)
                },
            )
        }
        val invRes = client.upsert(
            "app_inventory", invArr, onConflict = "child_id,device_id,package_name",
        )
        if (invRes is SupabaseClient.Result.Error) errors += "inventory:${invRes.code}"

        // Réconciliation : stamper removed_at pour les packages encore en base
        // (non déjà marqués) mais ABSENTS de l'inventaire courant → apps
        // désinstallées. Sinon elles resteraient affichées « à vie » côté parent.
        // On ne le fait qu'après un upsert réussi et si l'inventaire n'est pas
        // vide (une collecte vide, ex. erreur, ne doit pas tout marquer supprimé).
        if (invRes !is SupabaseClient.Result.Error && inventory.isNotEmpty()) {
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

        // 4) Batterie & stockage — EN DERNIER. C'est une série temporelle sans clé
        //    d'unicité : un insert simple n'est PAS idempotent. Comme le worker
        //    rejoue tout le cycle quand un seul upload échoue, on ne l'insère QUE
        //    si tout le reste du cycle a réussi (errors vide). Ainsi un cycle
        //    partiellement en échec n'écrit pas de device_status, et sa
        //    ré-exécution n'en crée pas de doublon. (Résidu connu : si l'insert
        //    aboutit côté serveur mais que la réponse est perdue, le retour en
        //    échec peut, au retry, créer un doublon ; cas rare, à traiter par une
        //    clé d'unicité serveur si besoin.)
        var statusOk = false
        if (errors.isEmpty()) {
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
            statusOk = client.upsert("device_status", statusArr) !is SupabaseClient.Result.Error
            if (!statusOk) errors += "status"
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
