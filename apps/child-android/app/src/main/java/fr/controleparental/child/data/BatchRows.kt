package fr.controleparental.child.data

import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

/**
 * Construction PURE des lignes envoyées en LOT à PostgREST (testable en JVM).
 *
 * RÈGLE (PGRST102) : dans un envoi groupé, PostgREST exige que TOUS les objets
 * aient exactement le même jeu de clés, sinon le lot ENTIER est rejeté (et des
 * données manquent côté parent). Deux cas :
 *  - colonne qui DOIT valoir NULL (appel masqué, removed_at « ressuscité »,
 *    catégorie inconnue en insertion simple) : clé présente avec null ;
 *  - colonne FACULTATIVE d'un upsert en fusion (app_label, category,
 *    installed_at de usage_daily / app_inventory) : clé RETIRÉE quand la valeur
 *    est inconnue, pour ne pas écraser une valeur connue par NULL. Les lignes
 *    sont alors envoyées en un upsert PAR JEU DE CLÉS ([groupByKeys]).
 *
 * Les lignes sont des Map ordonnées ; [toJsonArray] les convertit au dernier
 * moment (null → JSONObject.NULL) et refuse un lot hétérogène.
 */
object BatchRows {

    /** Colonnes communes (identité famille/enfant/appareil) de chaque ligne. */
    fun base(familyId: String, childId: String, deviceId: String): Map<String, Any?> = linkedMapOf(
        "family_id" to familyId,
        "child_id" to childId,
        "device_id" to deviceId,
    )

    /** Colonnes facultatives retirées si inconnues (upsert en fusion : pas d'écrasement par NULL). */
    val MERGE_OPTIONAL_COLUMNS = setOf("app_label", "category", "installed_at")

    fun usage(base: Map<String, Any?>, r: UsageStatsCollector.UsageRow): Map<String, Any?> = dropUnknownOptional(
        base + linkedMapOf(
            "day" to r.day,
            "package_name" to r.packageName,
            "app_label" to r.appLabel,
            "category" to r.category,
            "total_foreground_ms" to r.totalForegroundMs,
            "launch_count" to r.launchCount,
            "last_used_at" to iso(r.lastUsedAt),
        ),
    )

    fun inventory(base: Map<String, Any?>, r: AppInventoryCollector.AppRow, seenAtMs: Long): Map<String, Any?> =
        dropUnknownOptional(base + linkedMapOf(
            "package_name" to r.packageName,
            "app_label" to r.appLabel,
            "category" to r.category,
            "is_system" to r.isSystem,
            "installed_at" to r.installedAt?.let { iso(it) },
            "last_seen_at" to iso(seenAtMs),
            // App présente : on « ressuscite » une entrée éventuellement marquée
            // désinstallée (removed_at remis à null au merge). JAMAIS retirée.
            "removed_at" to null,
        ))

    /** Journal d'appels : counterparty_hash null = appel anonyme (« Numéro masqué »). */
    fun call(base: Map<String, Any?>, r: CallLogCollector.CallRow): Map<String, Any?> = base + linkedMapOf(
        "kind" to "call",
        "direction" to r.direction,
        "counterparty_hash" to r.counterpartyHash,
        "duration_ms" to r.durationMs,
        "occurred_at" to iso(r.occurredAt),
    )

    fun domainEvent(
        base: Map<String, Any?>, domain: String, category: String?, action: String, occurredAtIso: String,
    ): Map<String, Any?> = base + linkedMapOf(
        "domain" to domain,
        "category" to category,
        "action" to action,
        "occurred_at" to occurredAtIso,
    )

    fun safetySignal(
        base: Map<String, Any?>, category: String, severity: String, occurrenceCount: Int,
        occurredAtIso: String, sourceApp: String?,
    ): Map<String, Any?> = base + linkedMapOf(
        "category" to category,
        "severity" to severity,
        "occurrence_count" to occurrenceCount,
        "occurred_at" to occurredAtIso,
        "source_app" to sourceApp?.takeIf { it.isNotBlank() }?.take(200),
    )

    private fun dropUnknownOptional(row: Map<String, Any?>): Map<String, Any?> =
        row.filterNot { (k, v) -> v == null && k in MERGE_OPTIONAL_COLUMNS }

    /** Sous-lots homogènes (un upsert chacun), dans l'ordre d'apparition. */
    fun groupByKeys(rows: List<Map<String, Any?>>): List<List<Map<String, Any?>>> =
        rows.groupBy { it.keys }.values.toList()

    /** Toutes les lignes du lot ont-elles le même jeu de clés (exigence PostgREST) ? */
    fun haveSameKeys(rows: List<Map<String, Any?>>): Boolean =
        rows.isEmpty() || rows.all { it.keys == rows.first().keys }

    /** Conversion finale : null → JSONObject.NULL (la clé reste présente). */
    fun toJsonArray(rows: List<Map<String, Any?>>): JSONArray {
        check(haveSameKeys(rows)) { "Lot PostgREST hétérogène (PGRST102)" }
        val arr = JSONArray()
        for (row in rows) {
            val o = JSONObject()
            for ((k, v) in row) o.put(k, v ?: JSONObject.NULL)
            arr.put(o)
        }
        return arr
    }

    fun iso(epochMs: Long): String = Instant.ofEpochMilli(epochMs).toString()
}
