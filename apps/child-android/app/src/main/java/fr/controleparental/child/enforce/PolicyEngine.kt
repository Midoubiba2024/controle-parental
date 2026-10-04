package fr.controleparental.child.enforce

import java.util.Calendar

/**
 * LOT 2 — Moteur de décision PUR (sans dépendance Android → testable).
 *
 * À partir d'un package au premier plan, de l'usage agrégé du jour et du jeu de
 * règles, décide si l'app doit être bloquée, et pourquoi.
 *
 * LIGNE ROUGE (docs/02-CONFORMITE.md) :
 *   * Les appels d'URGENCE (112) ne sont JAMAIS bloqués. Le composeur par défaut,
 *     la pile télécom et notre propre app sont dans [emergencyAllow] et sortent
 *     toujours « autorisé ». La couche service n'affiche de surcroît aucun overlay
 *     pendant un appel en cours (voir EnforcementManager).
 *   * Tout blocage est VISIBLE (overlay explicite) et réversible ; jamais furtif.
 *
 * Ordre d'évaluation (le premier qui tranche gagne) :
 *   1. Exemptions d'urgence (composeur, télécom, app de supervision, lanceur)
 *   2. Règle d'app `always_allow` (ex. éducatif essentiel) → autorisé, exempt de tout
 *   3. Règle d'app `block` → bloqué
 *   4. Pause instantanée active (commande parent « à table ») → bloqué
 *   5. Plannings (sauf en mode vacances) : Downtime / plage interdite / hors plage
 *      autorisée / mode École
 *   6. Règle de catégorie `block` (sauf si l'app a `allow`)
 *   7. Validation d'installation : nouvelle app non approuvée → en attente (bloqué)
 *   8. Quotas de temps : app, puis catégorie, puis global (bonus du jour inclus)
 */
object PolicyEngine {

    data class Clock(val dayOfWeek: Int, val minuteOfDay: Int) {
        companion object {
            fun from(cal: Calendar): Clock {
                // Calendar.DAY_OF_WEEK : 1=dimanche … 7=samedi → 0..6
                val dow = cal.get(Calendar.DAY_OF_WEEK) - 1
                val minute = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
                return Clock(dow, minute)
            }
        }
    }

    /**
     * @param pkg package au premier plan
     * @param category catégorie résolue de l'app (game/social/… ou null)
     * @param rules jeu de règles courant
     * @param clock jour/minute locale
     * @param vacationActive mode vacances actif (plannings suspendus)
     * @param pauseActive une commande de pause est en cours
     * @param usagePkgMs usage du jour (ms) pour ce package
     * @param usageCatMs usage du jour (ms) pour la catégorie de ce package
     * @param usageTotalMs usage du jour (ms) tous packages confondus (hors exempts)
     * @param emergencyAllow packages jamais bloqués (composeur, télécom, nous, lanceur)
     * @param approvedPackages base d'apps connues/approuvées (validation d'install) ;
     *        null = fonction désactivée
     */
    fun evaluate(
        pkg: String,
        category: String?,
        rules: RuleSet,
        clock: Clock,
        vacationActive: Boolean,
        pauseActive: Boolean,
        usagePkgMs: Long,
        usageCatMs: Long,
        usageTotalMs: Long,
        emergencyAllow: Set<String>,
        approvedPackages: Set<String>?,
    ): Decision {
        // 1) Urgence : toujours autorisé.
        if (pkg in emergencyAllow) return Decision(false, BlockReason.EMERGENCY_EXEMPT)

        val appRule = rules.appRules.firstOrNull { it.targetType == "package" && it.targetValue == pkg }
        val catRule = category?.let { c -> rules.appRules.firstOrNull { it.targetType == "category" && it.targetValue == c } }

        // 2) always_allow : exempt de tout (A7).
        if (appRule?.action == "always_allow") return Decision(false, BlockReason.ALWAYS_ALLOWED)

        // 3) Blocage explicite de l'app (B1).
        if (appRule?.action == "block") {
            return Decision(true, BlockReason.BLOCK_APP)
        }

        // 4) Pause instantanée (A8).
        if (pauseActive) {
            return Decision(true, BlockReason.PAUSED)
        }

        val appExplicitlyAllowed = appRule?.action == "allow"

        // 5) Plannings (suspendus en mode vacances).
        if (!vacationActive) {
            // Downtime / plages interdites → bloqué (sauf always_allow déjà traité).
            for (s in rules.schedules) {
                when (s.kind) {
                    "downtime" -> if (anyWindowActive(s.windows, clock)) {
                        return Decision(true, BlockReason.SCHEDULE_DOWNTIME)
                    }
                    "blocked" -> if (anyWindowActive(s.windows, clock)) {
                        return Decision(true, BlockReason.SCHEDULE_BLOCKED)
                    }
                }
            }
            // Plages autorisées : s'il en existe, l'usage n'est permis QUE dedans.
            val allowedSchedules = rules.schedules.filter { it.kind == "allowed" }
            if (allowedSchedules.isNotEmpty() && !appExplicitlyAllowed) {
                val inside = allowedSchedules.any { anyWindowActive(it.windows, clock) }
                if (!inside) {
                    return Decision(true, BlockReason.OUTSIDE_ALLOWED_WINDOW)
                }
            }
            // Mode École : pendant les fenêtres, seules les apps autorisées passent.
            val schoolActive = rules.schedules.any { it.kind == "school" && anyWindowActive(it.windows, clock) }
            if (schoolActive && !appExplicitlyAllowed) {
                return Decision(true, BlockReason.SCHOOL_MODE)
            }
        }

        // 6) Blocage de catégorie (sauf si l'app est explicitement autorisée).
        if (!appExplicitlyAllowed && catRule?.action == "block") {
            return Decision(true, BlockReason.BLOCK_CATEGORY)
        }

        // 7) Validation d'installation (B2) : nouvelle app non approuvée.
        if (rules.policy?.blockNewApps == true && approvedPackages != null &&
            !appExplicitlyAllowed && pkg !in approvedPackages
        ) {
            return Decision(true, BlockReason.NEW_APP_PENDING)
        }

        // 8) Quotas de temps (bonus du jour inclus). always_allow déjà sorti.
        if (!appExplicitlyAllowed) {
            // a) Quota par app.
            if (appRule?.action == "limit" && appRule.dailyLimitMinutes != null) {
                val bonus = rules.grantsToday.filter { it.scopePackage == pkg }.sumOf { it.bonusMinutes }
                val limitMs = (appRule.dailyLimitMinutes + bonus).toLong() * 60_000L
                if (usagePkgMs >= limitMs) {
                    return Decision(true, BlockReason.LIMIT_APP)
                }
            }
            // b) Quota par catégorie.
            if (catRule?.action == "limit" && catRule.dailyLimitMinutes != null) {
                val limitMs = catRule.dailyLimitMinutes.toLong() * 60_000L
                if (usageCatMs >= limitMs) {
                    return Decision(true, BlockReason.LIMIT_CATEGORY)
                }
            }
        }
        // c) Quota global (s'applique aussi aux apps simplement 'allow' ; pas aux
        //    always_allow, déjà sorties).
        val globalLimit = effectiveGlobalLimitMinutes(rules, clock.dayOfWeek)
        if (globalLimit != null) {
            if (usageTotalMs >= globalLimit.toLong() * 60_000L) {
                return Decision(true, BlockReason.LIMIT_GLOBAL)
            }
        }

        return Decision.ALLOW
    }

    /** Limite globale du jour = (surcharge jour de semaine, sinon défaut) + bonus globaux. */
    fun effectiveGlobalLimitMinutes(rules: RuleSet, dayOfWeek: Int): Int? {
        val base = rules.weekdayLimits[dayOfWeek] ?: rules.policy?.dailyLimitMinutes ?: return null
        val bonus = rules.grantsToday.filter { it.scopePackage == null }.sumOf { it.bonusMinutes }
        return base + bonus
    }

    /** Une des fenêtres est-elle active maintenant (gestion du passage à minuit) ? */
    fun anyWindowActive(windows: List<ScheduleWindowData>, clock: Clock): Boolean =
        windows.any { windowActive(it, clock) }

    fun windowActive(w: ScheduleWindowData, clock: Clock): Boolean {
        val today = clock.dayOfWeek
        val yesterday = (today + 6) % 7
        if (w.endMinute > w.startMinute) {
            // Fenêtre intra-journée [start, end).
            return dowHas(w.dowMask, today) && clock.minuteOfDay >= w.startMinute && clock.minuteOfDay < w.endMinute
        }
        // Fenêtre qui franchit minuit : [start, 24h) le jour de départ, [0, end) le lendemain.
        val inEveningPart = dowHas(w.dowMask, today) && clock.minuteOfDay >= w.startMinute
        val inMorningPart = dowHas(w.dowMask, yesterday) && clock.minuteOfDay < w.endMinute
        return inEveningPart || inMorningPart
    }

    private fun dowHas(mask: Int, day: Int): Boolean = (mask and (1 shl day)) != 0
}
