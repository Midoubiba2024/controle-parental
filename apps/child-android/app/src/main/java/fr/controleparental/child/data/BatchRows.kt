package fr.controleparental.child.data

import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

/**
 * Construction PURE des lignes envoyées en LOT à PostgREST (testable en JVM).
 *
 * RÈGLE (PGRST102) : dans un envoi groupé, PostgREST exige que TOUS les objets
 * aient exactement le même jeu de clés. Une colonne facultative est donc toujours
 * présente, avec la valeur null si besoin, et jamais omise : sinon, un seul champ
 * absent (un libellé d'app introuvable, une catégorie inconnue, un appel masqué…)
 * fait rejeter le lot ENTIER, et des données manquent côté parent.
 *
 * Les lignes sont des Map ordonnées (null = colonne NULL) ; [toJsonArray] les
 * convertit au dernier moment (null → JSONObject.NULL, jamais une clé omise).
 */
object BatchRows {

    /** Colonnes communes (identité famille/enfant/appareil) de chaque ligne. */
    fun base(familyId: String, childId: String, deviceId: String): Map<String, Any?> = linkedMapOf(
        "family_id" to familyId,
        "child_id" to childId,
        "device_id" to deviceId,
    )

    fun usage(base: Map<String, Any?>, r: UsageStatsCollector.UsageRow): Map<String, Any?> = base + linkedMapOf(
        "day" to r.day,
        "package_name" to r.packageName,
        "app_label" to r.appLabel,
        "category" to r.category,
        "total_foreground_ms" to r.totalForegroundMs,
        "launch_count" to r.launchCount,
        "last_used_at" to iso(r.lastUsedAt),
    )

    fun inventory(base: Map<String, Any?>, r: AppInventoryCollector.AppRow, seenAtMs: Long): Map<String, Any?> =
        base + linkedMapOf(
            "package_name" to r.packageName,
            "app_label" to r.appLabel,
            "category" to r.category,
            "is_system" to r.isSystem,
            "installed_at" to r.installedAt?.let { iso(it) },
            "last_seen_at" to iso(seenAtMs),
            // App présente : on « ressuscite » une entrée éventuellement marquée
            // désinstallée (removed_at remis à null au merge).
            "removed_at" to null,
        )

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
