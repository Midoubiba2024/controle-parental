package fr.controleparental.child.enforce

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests du moteur de décision PUR (LOT 2). Couvre les garde-fous critiques :
 * exemption d'urgence (112), always_allow, pause, plannings (Downtime / plages /
 * École), mode vacances, blocages app/catégorie, quotas (app/catégorie/global)
 * avec bonus, et les fenêtres franchissant minuit.
 */
class PolicyEngineTest {

    private val EMERGENCY = setOf("com.android.dialer", "fr.controleparental.child")
    private val MIN = 60_000L // 1 minute en ms

    private fun clock(dow: Int, hhmm: Int) = PolicyEngine.Clock(dow, hhmm)

    private fun eval(
        pkg: String,
        category: String? = null,
        rules: RuleSet = RuleSet.EMPTY,
        clock: PolicyEngine.Clock = clock(3, 10 * 60), // mercredi 10:00
        vacation: Boolean = false,
        pause: Boolean = false,
        usagePkgMs: Long = 0,
        usageCatMs: Long = 0,
        usageTotalMs: Long = 0,
        approved: Set<String>? = null,
    ): Decision = PolicyEngine.evaluate(
        pkg, category, rules, clock, vacation, pause,
        usagePkgMs, usageCatMs, usageTotalMs, EMERGENCY, approved,
    )

    private fun rules(
        policy: AccessPolicyData? = null,
        weekday: Map<Int, Int> = emptyMap(),
        appRules: List<AppRuleData> = emptyList(),
        schedules: List<ScheduleData> = emptyList(),
        grants: List<TimeGrantData> = emptyList(),
    ) = RuleSet(policy, weekday, appRules, schedules, grants)

    private fun policy(
        daily: Int? = null, blockNew: Boolean = false,
    ) = AccessPolicyData(
        enforcementMode = "standard", dailyLimitMinutes = daily,
        graceEnabled = true, graceMinutes = 1, graceUsesPerDay = 1,
        blockNewApps = blockNew, maxContentRating = null, lockSystemSettings = false,
        vacationFrom = null, vacationUntil = null,
    )

    @Test fun emergencyNeverBlocked() {
        // Même sous pause et blocage global, le composeur d'urgence passe.
        val r = rules(policy(daily = 0), appRules = listOf(AppRuleData("package", "com.android.dialer", "block", null)))
        val d = eval("com.android.dialer", rules = r, pause = true, usageTotalMs = 999 * MIN)
        assertFalse(d.blocked)
        assertEquals(BlockReason.EMERGENCY_EXEMPT, d.reason)
    }

    @Test fun alwaysAllowBypassesEverything() {
        val r = rules(
            policy(daily = 0),
            appRules = listOf(AppRuleData("package", "com.edu.app", "always_allow", null)),
            schedules = listOf(ScheduleData("s", "downtime", listOf(ScheduleWindowData(127, 0, 1440)))),
        )
        val d = eval("com.edu.app", rules = r, pause = true, usageTotalMs = 999 * MIN)
        assertFalse(d.blocked)
        assertEquals(BlockReason.ALWAYS_ALLOWED, d.reason)
    }

    @Test fun blockedAppIsBlocked() {
        val r = rules(appRules = listOf(AppRuleData("package", "com.game", "block", null)))
        assertEquals(BlockReason.BLOCK_APP, eval("com.game", rules = r).reason)
    }

    @Test fun pauseBlocksOrdinaryApp() {
        val d = eval("com.game", pause = true)
        assertTrue(d.blocked)
        assertEquals(BlockReason.PAUSED, d.reason)
    }

    @Test fun downtimeBlocksInsideWindowOnly() {
        // Downtime 21:00 → 07:00 tous les jours.
        val sched = ScheduleData("s", "downtime", listOf(ScheduleWindowData(127, 21 * 60, 7 * 60)))
        val r = rules(schedules = listOf(sched))
        // 22:00 mercredi → bloqué (partie "soir" du jour courant).
        assertEquals(BlockReason.SCHEDULE_DOWNTIME, eval("com.game", rules = r, clock = clock(3, 22 * 60)).reason)
        // 06:00 mercredi → bloqué (partie "matin", issue de la veille).
        assertEquals(BlockReason.SCHEDULE_DOWNTIME, eval("com.game", rules = r, clock = clock(3, 6 * 60)).reason)
        // 10:00 mercredi → autorisé.
        assertFalse(eval("com.game", rules = r, clock = clock(3, 10 * 60)).blocked)
    }

    @Test fun vacationSuspendsSchedules() {
        val sched = ScheduleData("s", "downtime", listOf(ScheduleWindowData(127, 0, 1440)))
        val r = rules(schedules = listOf(sched))
        assertFalse(eval("com.game", rules = r, vacation = true).blocked)
    }

    @Test fun allowedWindowBlocksOutside() {
        // Plage autorisée 16:00 → 18:00 ; hors plage → bloqué.
        val sched = ScheduleData("s", "allowed", listOf(ScheduleWindowData(127, 16 * 60, 18 * 60)))
        val r = rules(schedules = listOf(sched))
        assertEquals(BlockReason.OUTSIDE_ALLOWED_WINDOW, eval("com.game", rules = r, clock = clock(3, 10 * 60)).reason)
        assertFalse(eval("com.game", rules = r, clock = clock(3, 17 * 60)).blocked)
    }

    @Test fun schoolModeAllowsOnlyWhitelisted() {
        val sched = ScheduleData("s", "school", listOf(ScheduleWindowData(127, 8 * 60, 16 * 60)))
        val r = rules(
            appRules = listOf(AppRuleData("package", "com.edu", "allow", null)),
            schedules = listOf(sched),
        )
        assertEquals(BlockReason.SCHOOL_MODE, eval("com.game", rules = r, clock = clock(3, 10 * 60)).reason)
        assertFalse(eval("com.edu", rules = r, clock = clock(3, 10 * 60)).blocked)
    }

    @Test fun categoryBlockUnlessAppAllowed() {
        val r = rules(appRules = listOf(AppRuleData("category", "game", "block", null)))
        assertEquals(BlockReason.BLOCK_CATEGORY, eval("com.game", category = "game", rules = r).reason)
        // Une règle d'app 'allow' surclasse le blocage de catégorie.
        val r2 = rules(appRules = listOf(
            AppRuleData("category", "game", "block", null),
            AppRuleData("package", "com.game", "allow", null),
        ))
        assertFalse(eval("com.game", category = "game", rules = r2).blocked)
    }

    @Test fun appLimitBlocksWhenReachedAndBonusExtends() {
        val r = rules(appRules = listOf(AppRuleData("package", "com.game", "limit", 30)))
        assertFalse(eval("com.game", rules = r, usagePkgMs = 29 * MIN).blocked)
        assertEquals(BlockReason.LIMIT_APP, eval("com.game", rules = r, usagePkgMs = 30 * MIN).reason)
        // +15 min de bonus sur ce package → 30 min d'usage repassent sous le quota.
        val rBonus = rules(
            appRules = listOf(AppRuleData("package", "com.game", "limit", 30)),
            grants = listOf(TimeGrantData(15, "com.game")),
        )
        assertFalse(eval("com.game", rules = rBonus, usagePkgMs = 30 * MIN).blocked)
    }

    @Test fun globalLimitWithWeekdayOverrideAndBonus() {
        // Défaut 60 min, mais mercredi (dow=3) surchargé à 20 min.
        val r = rules(policy(daily = 60), weekday = mapOf(3 to 20))
        assertEquals(BlockReason.LIMIT_GLOBAL, eval("com.x", rules = r, clock = clock(3, 10 * 60), usageTotalMs = 20 * MIN).reason)
        // Jeudi (dow=4) : pas de surcharge → 60 min.
        assertFalse(eval("com.x", rules = r, clock = clock(4, 10 * 60), usageTotalMs = 20 * MIN).blocked)
        // Bonus global +30 le mercredi → plafond 50 min.
        val rBonus = rules(policy(daily = 60), weekday = mapOf(3 to 20), grants = listOf(TimeGrantData(30, null)))
        assertFalse(eval("com.x", rules = rBonus, clock = clock(3, 10 * 60), usageTotalMs = 40 * MIN).blocked)
        assertEquals(50, PolicyEngine.effectiveGlobalLimitMinutes(rBonus, 3))
    }

    @Test fun newAppPendingWhenBlockNewAppsAndNotApproved() {
        val r = rules(policy(blockNew = true))
        assertEquals(BlockReason.NEW_APP_PENDING, eval("com.new", rules = r, approved = setOf("com.known")).reason)
        assertFalse(eval("com.known", rules = r, approved = setOf("com.known")).blocked)
        // Fonction désactivée si base d'approbation absente (null).
        assertFalse(eval("com.new", rules = r, approved = null).blocked)
    }

    @Test fun windowActiveOvernightCrossesMidnight() {
        val w = ScheduleWindowData(1 shl 3, 21 * 60, 7 * 60) // actif les mercredis
        // Mercredi 22:00 → dans la partie "soir".
        assertTrue(PolicyEngine.windowActive(w, clock(3, 22 * 60)))
        // Jeudi 06:00 → dans la partie "matin" héritée du mercredi.
        assertTrue(PolicyEngine.windowActive(w, clock(4, 6 * 60)))
        // Jeudi 08:00 → hors fenêtre.
        assertFalse(PolicyEngine.windowActive(w, clock(4, 8 * 60)))
    }
}
