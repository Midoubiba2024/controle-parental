package fr.controleparental.child.enforce

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import fr.controleparental.child.data.AppMeta
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.data.UsageStatsCollector
import java.util.Calendar
import org.json.JSONObject

/**
 * LOT 2 — Orchestration de l'application des règles côté appareil (couche Android).
 *
 * Résout l'app au premier plan, agrège l'usage du jour, calcule la liste
 * d'exemption d'urgence, puis délègue la décision au moteur PUR [PolicyEngine].
 *
 * Garde-fou URGENCE : si un appel est en cours (téléphonie non IDLE) OU si l'app
 * au premier plan est le composeur par défaut / la pile télécom, on n'affiche
 * JAMAIS d'overlay (retour « autorisé »). L'appel 112 reste toujours possible.
 */
class EnforcementManager(private val context: Context) {

    private val cache = PolicyCache(context)
    private val store = SupervisionStore(context)
    private val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    private val pm = context.packageManager

    @Volatile private var rules: RuleSet = RuleSet.EMPTY

    // Usage du jour mis en cache ~60 s (coûteux à recalculer à chaque tick).
    private var usageAt = 0L
    private var usagePkg = emptyMap<String, Long>()
    private var usageCat = emptyMap<String, Long>()
    private var usageTotal = 0L

    fun setRules(r: RuleSet) { rules = r }
    fun loadFromCache() {
        cache.rulesJson?.let { json ->
            runCatching { rules = PolicyClient.parseRuleSet(JSONObject(json)) }
        }
    }

    /** Décision pour l'app actuellement au premier plan (null = rien à faire). */
    fun evaluateForeground(now: Long = System.currentTimeMillis()): Pair<String, Decision>? {
        if (isCallActive()) return null                 // ne jamais gêner un appel
        val pkg = currentForegroundPackage(now) ?: return null
        if (pkg == context.packageName) return null     // notre propre app

        val emergency = emergencyAllow()
        if (pkg in emergency) return pkg to Decision(false, BlockReason.EMERGENCY_EXEMPT)

        refreshUsageIfStale(now)
        val category = AppMeta.resolve(pm, pkg)?.second
        val clock = PolicyEngine.Clock.from(Calendar.getInstance(java.util.TimeZone.getDefault(), java.util.Locale.ROOT))
        val approved = if (cache.hasBaseline) cache.approvedPackages else null

        val decision = PolicyEngine.evaluate(
            pkg = pkg,
            category = category,
            rules = rules,
            clock = clock,
            vacationActive = vacationActive(),
            pauseActive = cache.pauseActive,
            usagePkgMs = usagePkg[pkg] ?: 0L,
            usageCatMs = category?.let { usageCat[it] } ?: 0L,
            usageTotalMs = usageTotal,
            emergencyAllow = emergency,
            approvedPackages = approved,
        )
        return pkg to decision
    }

    /**
     * Mode Renforcé : suspend les apps en blocage STATIQUE (règle d'app `block`
     * ou catégorie `block`), hors exemptions. Les blocages dynamiques (horaires,
     * quotas) restent gérés par l'overlay. Appeler après chaque synchro de règles.
     */
    fun applyStaticSuspensions(reinforced: ReinforcedEnforcer, installed: Set<String>) {
        if (!reinforced.isDeviceOwner()) return
        val emergency = emergencyAllow()
        val toBlock = mutableListOf<String>()
        val toUnblock = mutableListOf<String>()
        for (p in installed) {
            if (p == context.packageName || p in emergency) { toUnblock += p; continue }
            val appRule = rules.appRules.firstOrNull { it.targetType == "package" && it.targetValue == p }
            if (appRule?.action == "always_allow" || appRule?.action == "allow") { toUnblock += p; continue }
            val cat = AppMeta.resolve(pm, p)?.second
            val catRule = cat?.let { c -> rules.appRules.firstOrNull { it.targetType == "category" && it.targetValue == c } }
            val blocked = appRule?.action == "block" || catRule?.action == "block"
            if (blocked) toBlock += p else toUnblock += p
        }
        reinforced.applySuspensions(toBlock, toUnblock)
    }

    // --- Internes -----------------------------------------------------------

    private fun vacationActive(): Boolean {
        val p = rules.policy ?: return false
        val from = p.vacationFrom ?: return false
        val until = p.vacationUntil ?: return false
        val today = java.time.LocalDate.now().toString()
        return from <= today && today <= until
    }

    private fun isCallActive(): Boolean = runCatching {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        @Suppress("DEPRECATION")
        tm.callState != TelephonyManager.CALL_STATE_IDLE
    }.getOrDefault(false)

    /** Composeur par défaut + pile télécom + lanceur : jamais bloqués. */
    private fun emergencyAllow(): Set<String> {
        val set = mutableSetOf(context.packageName)
        runCatching {
            val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            telecom.defaultDialerPackage?.let { set += it }
        }
        set += "com.android.dialer"
        set += "com.google.android.dialer"
        set += "com.android.phone"
        set += "com.android.server.telecom"
        set += "com.android.emergency"
        return set
    }

    private fun currentForegroundPackage(now: Long): String? {
        // Dernier évènement de passage au premier plan sur les ~10 dernières s.
        val events = usm.queryEvents(now - 10_000, now)
        val ev = UsageEvents.Event()
        var last: String? = null
        while (events.getNextEvent(ev)) {
            if (ev.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                ev.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                last = ev.packageName
            }
        }
        return last
    }

    private fun refreshUsageIfStale(now: Long) {
        if (now - usageAt < 60_000 && usageAt != 0L) return
        // Quotas : seul l'usage depuis l'appairage compte (LOT 12b).
        val rows = runCatching { UsageStatsCollector(context).collect(daysBack = 1, notBefore = store.enrolledAt) }
            .getOrDefault(emptyList())
        val pkg = HashMap<String, Long>()
        val cat = HashMap<String, Long>()
        var total = 0L
        for (r in rows) {
            pkg[r.packageName] = (pkg[r.packageName] ?: 0L) + r.totalForegroundMs
            val c = r.category ?: "other"
            cat[c] = (cat[c] ?: 0L) + r.totalForegroundMs
            total += r.totalForegroundMs
        }
        usagePkg = pkg; usageCat = cat; usageTotal = total; usageAt = now
    }
}
