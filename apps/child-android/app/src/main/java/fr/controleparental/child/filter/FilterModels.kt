package fr.controleparental.child.filter

/**
 * LOT 4 — Modèles de la politique de FILTRAGE (sinkhole DNS local).
 *
 * LIGNE ROUGE anti-stalkerware : ces données ne pilotent QUE la résolution de
 * NOMS DE DOMAINE (allow/block/réécriture SafeSearch). Jamais de MITM, jamais de
 * déchiffrement TLS, jamais d'inspection de contenu ou de payload.
 */
data class FilterPolicyData(
    val enabled: Boolean,
    val agePreset: String,               // young_child | preteen | teen
    val blockedCategories: Set<String>,  // app.filter_category
    val safeSearch: Boolean,
    val youtubeRestriction: String,      // off | moderate | strict
    val whitelistOnly: Boolean,
    val askToBrowse: Boolean,
    val logAllowed: Boolean,
    val retentionDays: Int,
) {
    companion object {
        /** Politique par défaut prudente (privacy by default) si rien n'est encore synchronisé. */
        val SAFE_DEFAULT = FilterPolicyData(
            enabled = true,
            agePreset = "young_child",
            blockedCategories = setOf("adult"),
            safeSearch = true,
            youtubeRestriction = "moderate",
            whitelistOnly = false,
            askToBrowse = false,
            logAllowed = false,
            retentionDays = 30,
        )
    }
}

/** Règle de liste explicite (C2). action = allow | block. */
data class FilterRuleData(val domain: String, val action: String)

/** Configuration complète appliquée par le resolver : politique + listes. */
data class FilterConfig(
    val policy: FilterPolicyData,
    val allow: Set<String>,   // domaines normalisés (liste blanche)
    val block: Set<String>,   // domaines normalisés (liste noire)
) {
    companion object {
        val EMPTY = FilterConfig(FilterPolicyData.SAFE_DEFAULT, emptySet(), emptySet())
    }
}
