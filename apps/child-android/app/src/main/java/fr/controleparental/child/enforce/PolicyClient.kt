package fr.controleparental.child.enforce

import fr.controleparental.child.data.SupabaseClient
import fr.controleparental.child.data.SupervisionStore
import java.net.URLEncoder
import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject

/**
 * LOT 2 — Récupération des RÈGLES et des COMMANDES depuis Supabase (PostgREST),
 * sous la session de l'appareil enfant (lecture RLS de SES règles). Normalise le
 * résultat en un objet JSON stable (mis en cache chiffré pour l'hors-ligne) puis
 * en [RuleSet] pour le moteur.
 */
class PolicyClient(private val store: SupervisionStore) {

    private val client = SupabaseClient(store)

    data class CommandRow(val id: String, val type: String, val payload: JSONObject)
    data class MessageRow(val id: String, val body: String, val createdAt: String)

    /**
     * Synchronise les règles et les met en cache. Renvoie le [RuleSet] à jour, ou
     * null en cas d'échec réseau (l'appelant conserve alors le cache précédent).
     * Alimente aussi la base d'apps approuvées (validation d'installation).
     */
    suspend fun syncAndCache(cache: PolicyCache, installedPackages: Set<String>): RuleSet? {
        val e = store.load() ?: return null
        val cid = e.childId
        val today = LocalDate.now().toString()

        val pol = firstRow(client.get("access_policies", "child_id=eq.$cid&select=*")) ?: run {
            // Distinguer « pas de règle » (ok, objet vide) d'une erreur réseau.
            if (lastWasNetworkError) return null
            null
        }
        val limArr = rows(client.get("screen_time_limits", "child_id=eq.$cid&select=day_of_week,limit_minutes")) ?: return null
        val arArr = rows(client.get("app_rules", "child_id=eq.$cid&select=target_type,target_value,action,daily_limit_minutes")) ?: return null
        val schArr = rows(client.get("child_schedules",
            "child_id=eq.$cid&enabled=is.true&select=schedule:schedules(id,kind,schedule_windows(dow_mask,start_minute,end_minute))")) ?: return null
        val grArr = rows(client.get("time_grants", "child_id=eq.$cid&grant_date=eq.$today&select=bonus_minutes,scope_package")) ?: return null

        // --- Normalisation en objet stable ------------------------------------
        val combined = JSONObject()
        if (pol != null) combined.put("policy", pol)
        combined.put("limits", limArr)
        combined.put("appRules", arArr)
        val schedules = JSONArray()
        for (i in 0 until schArr.length()) {
            val s = schArr.optJSONObject(i)?.optJSONObject("schedule") ?: continue
            val windows = JSONArray()
            val w = s.optJSONArray("schedule_windows") ?: JSONArray()
            for (j in 0 until w.length()) {
                val wo = w.optJSONObject(j) ?: continue
                windows.put(JSONObject()
                    .put("dowMask", wo.optInt("dow_mask"))
                    .put("startMinute", wo.optInt("start_minute"))
                    .put("endMinute", wo.optInt("end_minute")))
            }
            schedules.put(JSONObject().put("kind", s.optString("kind")).put("windows", windows))
        }
        combined.put("schedules", schedules)
        combined.put("grants", grArr)

        cache.rulesJson = combined.toString()

        // Base d'apps approuvées (B2) : figée à la première synchro = apps déjà
        // présentes. Les apps ajoutées ensuite seront « nouvelles » tant qu'une
        // règle allow/always_allow n'existe pas.
        if (!cache.hasBaseline) cache.approvedPackages = installedPackages

        return parseRuleSet(combined)
    }

    /** Commandes en attente pour cet appareil (pause/verrouillage/sonner/message). */
    suspend fun pendingCommands(): List<CommandRow> {
        val e = store.load() ?: return emptyList()
        val res = client.get("commands",
            "device_id=eq.${e.deviceId}&status=eq.pending&select=id,type,payload&order=created_at.asc")
        val arr = rows(res) ?: return emptyList()
        val out = mutableListOf<CommandRow>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out += CommandRow(
                id = o.optString("id"),
                type = o.optString("type"),
                payload = o.optJSONObject("payload") ?: JSONObject(),
            )
        }
        return out
    }

    /** Accuse réception / clôture une commande (status = delivered|acked). */
    suspend fun ackCommand(id: String, status: String): Boolean {
        val patch = JSONObject().put("status", status)
        if (status == "delivered") patch.put("delivered_at", nowIso())
        if (status == "acked") patch.put("acked_at", nowIso())
        return client.patch("commands", "id=eq.$id", patch) is SupabaseClient.Result.Ok
    }

    /** Messages du PARENT postés après [sinceIso] (null = depuis l'origine). */
    suspend fun newParentMessages(sinceIso: String?): List<MessageRow> {
        val e = store.load() ?: return emptyList()
        // URL-encode : created_at renvoyé par PostgREST contient « +00:00 », dont le
        // '+' deviendrait un espace dans la query → le curseur casserait au 2e sondage.
        val since = URLEncoder.encode(sinceIso ?: "1970-01-01T00:00:00Z", "UTF-8")
        val res = client.get(
            "messages",
            "child_id=eq.${e.childId}&sender=eq.parent&created_at=gt.$since" +
                "&order=created_at.asc&select=id,body,created_at",
        )
        val arr = rows(res) ?: return emptyList()
        val out = mutableListOf<MessageRow>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out += MessageRow(o.optString("id"), o.optString("body"), o.optString("created_at"))
        }
        return out
    }

    /** Accuse réception (read_at) des messages notifiés. */
    suspend fun markMessagesRead(ids: List<String>): Boolean {
        if (ids.isEmpty()) return true
        val inList = ids.joinToString(",")
        val patch = JSONObject().put("read_at", nowIso())
        return client.patch("messages", "id=in.($inList)", patch) is SupabaseClient.Result.Ok
    }

    /** L'enfant crée une demande (temps supplémentaire, déblocage) — co-régulation. */
    suspend fun createRequest(kind: String, payload: JSONObject, note: String?): Boolean {
        val e = store.load() ?: return false
        val row = JSONObject()
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
            .put("kind", kind)
            .put("payload", payload)
        if (note != null) row.put("child_note", note)
        return client.upsert("requests", JSONArray().put(row)) is SupabaseClient.Result.Ok
    }

    // --- Helpers ------------------------------------------------------------
    private var lastWasNetworkError = false

    private fun rows(res: SupabaseClient.GetResult): JSONArray? = when (res) {
        is SupabaseClient.GetResult.Ok -> { lastWasNetworkError = false; try { JSONArray(res.body) } catch (_: Exception) { JSONArray() } }
        is SupabaseClient.GetResult.Error -> { lastWasNetworkError = true; null }
    }

    private fun firstRow(res: SupabaseClient.GetResult): JSONObject? {
        val arr = rows(res) ?: return null
        return if (arr.length() > 0) arr.optJSONObject(0) else null
    }

    private fun nowIso(): String = java.time.Instant.now().toString()

    companion object {
        fun parseRuleSet(o: JSONObject): RuleSet {
            val policy = o.optJSONObject("policy")?.let { p ->
                AccessPolicyData(
                    enforcementMode = p.optString("enforcement_mode", "standard"),
                    dailyLimitMinutes = if (p.isNull("daily_limit_minutes")) null else p.optInt("daily_limit_minutes"),
                    graceEnabled = p.optBoolean("grace_enabled", true),
                    graceMinutes = p.optInt("grace_minutes", 1),
                    graceUsesPerDay = p.optInt("grace_uses_per_day", 1),
                    blockNewApps = p.optBoolean("block_new_apps", false),
                    maxContentRating = if (p.isNull("max_content_rating")) null else p.optString("max_content_rating"),
                    lockSystemSettings = p.optBoolean("lock_system_settings", false),
                    vacationFrom = if (p.isNull("vacation_from")) null else p.optString("vacation_from"),
                    vacationUntil = if (p.isNull("vacation_until")) null else p.optString("vacation_until"),
                )
            }
            val weekday = HashMap<Int, Int>()
            o.optJSONArray("limits")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val r = arr.optJSONObject(i) ?: continue
                    if (r.isNull("day_of_week")) continue
                    weekday[r.optInt("day_of_week")] = r.optInt("limit_minutes")
                }
            }
            val appRules = mutableListOf<AppRuleData>()
            o.optJSONArray("appRules")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val r = arr.optJSONObject(i) ?: continue
                    appRules += AppRuleData(
                        targetType = r.optString("target_type"),
                        targetValue = r.optString("target_value"),
                        action = r.optString("action"),
                        dailyLimitMinutes = if (r.isNull("daily_limit_minutes")) null else r.optInt("daily_limit_minutes"),
                    )
                }
            }
            val schedules = mutableListOf<ScheduleData>()
            o.optJSONArray("schedules")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val r = arr.optJSONObject(i) ?: continue
                    val windows = mutableListOf<ScheduleWindowData>()
                    val w = r.optJSONArray("windows") ?: JSONArray()
                    for (j in 0 until w.length()) {
                        val wo = w.optJSONObject(j) ?: continue
                        windows += ScheduleWindowData(wo.optInt("dowMask"), wo.optInt("startMinute"), wo.optInt("endMinute"))
                    }
                    schedules += ScheduleData(id = "", kind = r.optString("kind"), windows = windows)
                }
            }
            val grants = mutableListOf<TimeGrantData>()
            o.optJSONArray("grants")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val r = arr.optJSONObject(i) ?: continue
                    grants += TimeGrantData(
                        bonusMinutes = r.optInt("bonus_minutes"),
                        scopePackage = if (r.isNull("scope_package")) null else r.optString("scope_package"),
                    )
                }
            }
            return RuleSet(policy, weekday, appRules, schedules, grants)
        }
    }
}
