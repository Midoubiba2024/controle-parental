package fr.controleparental.child.enforce

/**
 * LOT 2 — Modèles de RÈGLES D'ACCÈS côté appareil (miroir des tables Supabase).
 * Uniquement des réglages (limites, blocages, plannings, bonus) — jamais de
 * contenu. Tout est également visible par l'enfant (écran « mes données »).
 */

data class AccessPolicyData(
    val enforcementMode: String,          // "standard" | "reinforced"
    val dailyLimitMinutes: Int?,          // limite globale par défaut (null = aucune)
    val graceEnabled: Boolean,
    val graceMinutes: Int,
    val graceUsesPerDay: Int,
    val blockNewApps: Boolean,
    val maxContentRating: String?,
    val lockSystemSettings: Boolean,
    val vacationFrom: String?,            // YYYY-MM-DD
    val vacationUntil: String?,           // YYYY-MM-DD
)

data class AppRuleData(
    val targetType: String,               // "package" | "category"
    val targetValue: String,
    val action: String,                   // "block" | "allow" | "limit" | "always_allow"
    val dailyLimitMinutes: Int?,
)

data class ScheduleWindowData(
    val dowMask: Int,                     // bit 0 = dimanche … bit 6 = samedi
    val startMinute: Int,                 // minutes depuis minuit local
    val endMinute: Int,                   // end <= start ⇒ franchit minuit
)

data class ScheduleData(
    val id: String,
    val kind: String,                     // "downtime" | "allowed" | "blocked" | "school"
    val windows: List<ScheduleWindowData>,
)

data class TimeGrantData(
    val bonusMinutes: Int,
    val scopePackage: String?,            // null = quota global du jour
)

/** Jeu complet de règles applicables à un enfant/appareil, à un instant donné. */
data class RuleSet(
    val policy: AccessPolicyData?,
    val weekdayLimits: Map<Int, Int>,     // dow (0..6) -> minutes (surcharge du défaut)
    val appRules: List<AppRuleData>,
    val schedules: List<ScheduleData>,    // seulement ceux assignés ET activés
    val grantsToday: List<TimeGrantData>,
) {
    companion object {
        val EMPTY = RuleSet(null, emptyMap(), emptyList(), emptyList(), emptyList())
    }
}

/** Motif d'une décision de blocage (affiché à l'enfant — transparence). */
enum class BlockReason {
    ALLOWED,
    EMERGENCY_EXEMPT,
    ALWAYS_ALLOWED,
    PAUSED,
    SCHEDULE_DOWNTIME,
    SCHEDULE_BLOCKED,
    OUTSIDE_ALLOWED_WINDOW,
    SCHOOL_MODE,
    BLOCK_APP,
    BLOCK_CATEGORY,
    NEW_APP_PENDING,
    LIMIT_APP,
    LIMIT_CATEGORY,
    LIMIT_GLOBAL,
}

data class Decision(
    val blocked: Boolean,
    val reason: BlockReason,
    /** Message court adapté à l'enfant (jamais culpabilisant, toujours clair). */
    val message: String = "",
) {
    companion object {
        val ALLOW = Decision(false, BlockReason.ALLOWED)
    }
}
