package fr.controleparental.child.filter

import fr.controleparental.child.data.BatchRows
import fr.controleparental.child.data.SupabaseClient
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.service.Unenrollment
import org.json.JSONArray
import org.json.JSONObject

/**
 * LOT 4 — Récupération de la POLITIQUE de filtrage et des LISTES depuis Supabase
 * (PostgREST), sous la session de l'appareil enfant (lecture RLS de SA politique
 * → transparence). Alimente aussi le JOURNAL de domaines (métadonnées), l'ÉTAT du
 * filtrage (anti-contournement transparent C9) et les demandes Ask-to-Browse (C6).
 *
 * LIGNE ROUGE : le journal ne contient QUE des métadonnées de domaines (nom +
 * catégorie + action + heure). Jamais d'URL complète, de requête ni de contenu.
 */
class FilterClient(private val store: SupervisionStore) {

    private val client = SupabaseClient(store)
    private var lastWasNetworkError = false

    /**
     * Synchronise la configuration et la met en cache. Renvoie la [FilterConfig]
     * à jour, ou null en cas d'échec réseau (l'appelant conserve alors le cache).
     */
    suspend fun syncAndCache(cache: FilterCache): FilterConfig? {
        val e = store.load() ?: return null
        val cid = e.childId
        val deviceId = e.deviceId

        val pol = firstRow(client.get("filter_policy", "child_id=eq.$cid&select=*"))
        if (pol == null && lastWasNetworkError) return null
        val rulesArr = rows(client.get("filter_rules", "child_id=eq.$cid&select=domain,action")) ?: return null

        val combined = JSONObject()
        if (pol != null) combined.put("policy", pol)
        combined.put("rules", rulesArr)
        // Jamais réécrit après (ou pendant) un démontage (LOT 12b).
        return Unenrollment.ifStillEnrolled(deviceId) {
            cache.configJson = combined.toString()
            parseConfig(combined)
        }
    }

    /** Charge la config depuis le cache chiffré (hors ligne / écran « mes données »). */
    fun fromCache(cache: FilterCache): FilterConfig? {
        val json = cache.configJson ?: return null
        return runCatching { parseConfig(JSONObject(json)) }.getOrNull()
    }

    /** Reporte l'état du VPN de filtrage (heartbeat / anti-contournement C9). */
    suspend fun reportStatus(vpnActive: Boolean): Boolean {
        val e = store.load() ?: return false
        val row = JSONObject()
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
            .put("vpn_active", vpnActive)
        if (vpnActive) row.put("last_active_at", nowIso()) else row.put("last_revoked_at", nowIso())
        return client.upsert("filter_status", JSONArray().put(row), onConflict = "device_id") is SupabaseClient.Result.Ok
    }

    /** Journalise un lot d'événements de domaines (métadonnées seulement). */
    suspend fun logDomainEvents(events: List<DomainEvent>): Boolean {
        if (events.isEmpty()) return true
        val e = store.load() ?: return false
        // Seuls les événements capturés sous CET enrôlement partent : jamais ceux
        // d'un ancien appairage sous l'identité d'un nouvel enfant (LOT 12b).
        val mine = eventsForDevice(events, e.deviceId)
        if (mine.isEmpty()) return true
        // category null reste une clé PRÉSENTE : lot homogène exigé par PostgREST (PGRST102).
        val base = BatchRows.base(e.familyId, e.childId, e.deviceId)
        val arr = BatchRows.toJsonArray(
            mine.map { BatchRows.domainEvent(base, it.domain, it.category, it.action, it.occurredAtIso) },
        )
        return client.upsert("domain_events", arr) is SupabaseClient.Result.Ok
    }

    /** L'enfant demande l'accès à un domaine bloqué (Ask-to-Browse, C6). */
    suspend fun createBrowseRequest(domain: String, note: String?): Boolean {
        val e = store.load() ?: return false
        val row = JSONObject()
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
            .put("kind", "browse")
            .put("payload", JSONObject().put("domain", domain))
        if (note != null) row.put("child_note", note)
        return client.upsert("requests", JSONArray().put(row)) is SupabaseClient.Result.Ok
    }

    /** Événement de domaine à journaliser (métadonnée). */
    data class DomainEvent(
        val domain: String,
        val category: String?,
        val action: String,        // blocked | allowed | rewritten
        val occurredAtIso: String,
        /** Appareil enrôlé AU MOMENT de la capture (jamais réattribué à un autre). */
        val deviceId: String,
    )

    // --- Helpers ------------------------------------------------------------
    private fun rows(res: SupabaseClient.GetResult): JSONArray? = when (res) {
        is SupabaseClient.GetResult.Ok -> { lastWasNetworkError = false; runCatching { JSONArray(res.body) }.getOrDefault(JSONArray()) }
        is SupabaseClient.GetResult.Error -> { lastWasNetworkError = true; null }
    }

    private fun firstRow(res: SupabaseClient.GetResult): JSONObject? {
        val arr = rows(res) ?: return null
        return if (arr.length() > 0) arr.optJSONObject(0) else null
    }

    private fun nowIso(): String = java.time.Instant.now().toString()

    companion object {
        fun parseConfig(o: JSONObject): FilterConfig {
            val policy = o.optJSONObject("policy")?.let { p ->
                FilterPolicyData(
                    enabled = p.optBoolean("enabled", true),
                    agePreset = p.optString("age_preset", "young_child"),
                    blockedCategories = toStringSet(p.optJSONArray("blocked_categories")),
                    safeSearch = p.optBoolean("safe_search", true),
                    youtubeRestriction = p.optString("youtube_restriction", "moderate"),
                    whitelistOnly = p.optBoolean("whitelist_only", false),
                    askToBrowse = p.optBoolean("ask_to_browse", false),
                    logAllowed = p.optBoolean("log_allowed", false),
                    retentionDays = p.optInt("retention_days", 30),
                )
            } ?: FilterPolicyData.SAFE_DEFAULT

            val allow = HashSet<String>()
            val block = HashSet<String>()
            o.optJSONArray("rules")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val r = arr.optJSONObject(i) ?: continue
                    val d = r.optString("domain").trim().lowercase()
                    if (d.isEmpty()) continue
                    when (r.optString("action")) {
                        "allow" -> allow.add(d)
                        "block" -> block.add(d)
                    }
                }
            }
            return FilterConfig(policy, allow, block)
        }

        private fun toStringSet(arr: JSONArray?): Set<String> {
            if (arr == null) return emptySet()
            val s = HashSet<String>()
            for (i in 0 until arr.length()) arr.optString(i).takeIf { it.isNotEmpty() }?.let { s.add(it) }
            return s
        }
    }
}
