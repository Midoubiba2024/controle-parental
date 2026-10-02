package fr.controleparental.child.filter

/**
 * LOT 4 — Moteur de décision de FILTRAGE DNS, PUR et testable (aucune dépendance
 * Android, à l'image de PolicyEngine en LOT 2). À partir d'un nom d'hôte et de la
 * configuration, décide : autoriser / bloquer / réécrire (SafeSearch).
 *
 * LIGNE ROUGE : la décision porte UNIQUEMENT sur le nom de domaine. Aucun contenu
 * n'est inspecté. La liste blanche système/essentielle et les urgences ne sont
 * jamais entravées.
 *
 * Ordre de décision :
 *   1. hôte essentiel/système      → Allow (jamais casser la connectivité vitale)
 *   2. filtrage désactivé          → Allow (passe-plat)
 *   3. liste noire explicite (C2)  → Block
 *   4. réécriture SafeSearch/YouTube (C3/C4) si activée → Rewrite
 *   5. liste blanche explicite (C2)→ Allow (surclasse le blocage de catégorie)
 *   6. liste blanche stricte (C5)  → Block si hors liste blanche
 *   7. catégorie bloquée (C1/C7)   → Block(catégorie)
 *   8. sinon                       → Allow
 */
class DnsFilterEngine(initial: FilterConfig) {

    @Volatile private var config: FilterConfig = initial

    sealed interface Decision {
        /** Résolution normale (transférée à l'upstream). */
        data object Allow : Decision
        /** Résolution bloquée (sinkhole). [category] = motif (null si liste noire). */
        data class Block(val category: String?) : Decision
        /** Réécriture : on répond un CNAME host → [target] (SafeSearch/YouTube). */
        data class Rewrite(val target: String) : Decision
    }

    fun update(newConfig: FilterConfig) { config = newConfig }

    fun decide(rawHost: String): Decision {
        val host = normalize(rawHost)
        if (host.isEmpty()) return Decision.Allow

        // 1. Essentiels / système : toujours résolus.
        if (DomainLists.matches(host, DomainLists.ESSENTIAL)) return Decision.Allow

        val p = config.policy
        // 2. Filtrage désactivé : passe-plat.
        if (!p.enabled) return Decision.Allow

        // 3. Liste noire explicite.
        if (DomainLists.matches(host, config.block)) return Decision.Block(null)

        // 4. Réécriture SafeSearch / YouTube restreint.
        if (p.safeSearch) {
            DomainLists.SAFE_SEARCH_REWRITE[host]?.let { return Decision.Rewrite(it) }
        }
        if (DomainLists.matches(host, DomainLists.YOUTUBE_HOSTS)) {
            DomainLists.youtubeTarget(p.youtubeRestriction)?.let { return Decision.Rewrite(it) }
        }

        // 5. Liste blanche explicite : surclasse les blocages de catégorie.
        if (DomainLists.matches(host, config.allow)) return Decision.Allow

        // 6. Liste blanche stricte (jeune enfant) : tout le reste est bloqué.
        if (p.whitelistOnly) return Decision.Block(null)

        // 7. Catégorie bloquée.
        val cat = DomainLists.categoryOf(host)
        if (cat != null && cat in p.blockedCategories) return Decision.Block(cat)

        // 8. Défaut : autorisé.
        return Decision.Allow
    }

    private fun normalize(host: String): String {
        var h = host.trim().lowercase()
        if (h.endsWith(".")) h = h.dropLast(1)
        return h
    }
}
