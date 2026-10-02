package fr.controleparental.child.safety

/**
 * LOT 6 — Moteur de détection de risque PUR (sans dépendance Android → testable),
 * comme `enforce/PolicyEngine` et `filter/DnsFilterEngine`.
 *
 * À partir d'un TEXTE (passé en mémoire) et de son application source, renvoie
 * 0..n [SafetySignal] `{catégorie, gravité, compteur}`.
 *
 * 🔴 LIGNE ROUGE (docs/02-CONFORMITE.md §G, docs/11-LOT6-BIEN-ETRE.md) :
 *   * AUCUNE I/O, aucun log, aucune écriture. Le [text] n'est jamais stocké, mis en
 *     cache, renvoyé, ni inclus dans un résultat — seulement comparé à des motifs.
 *   * La sortie ne contient QUE des métadonnées (catégorie/gravité/compteur).
 *   * Analyse strictement locale : le résultat sert à produire une ALERTE, jamais à
 *     exfiltrer le contenu.
 *
 * Calcul de gravité (par catégorie) à partir d'un score pondéré
 * (marqueur fort = 2, faible = 1) :
 *   * Catégories sensibles (mal-être, grooming, contenu sexuel) : plancher MEDIUM
 *     dès qu'un marqueur fort est présent.
 *   * HIGH au-delà d'un seuil propre à la catégorie — pour le grooming (G4), HIGH
 *     exige une COMBINAISON de motifs (score ≥ 3), pas un simple mot isolé.
 */
object SafetyDetectionEngine {

    /**
     * Analyse [text] (contenu d'une notification, en mémoire) et renvoie les signaux.
     * [sourceApp] n'est pas utilisé pour la détection ici — il est transmis tel quel,
     * en métadonnée, par l'appelant (le moteur reste agnostique de la source).
     */
    fun analyze(text: String, sourceApp: String? = null): List<SafetySignal> {
        if (text.isBlank()) return emptyList()
        val norm = SafetyLexicon.normalize(text)
        if (norm.isBlank()) return emptyList()

        val signals = ArrayList<SafetySignal>()
        for (category in SafetyCategory.entries) {
            val strongHits = SafetyLexicon.countMatches(norm, SafetyLexicon.strong[category].orEmpty())
            val weakHits = SafetyLexicon.countMatches(norm, SafetyLexicon.weak[category].orEmpty())
            val total = strongHits + weakHits
            if (total == 0) continue
            signals.add(
                SafetySignal(
                    category = category,
                    severity = severityOf(category, strongHits, weakHits),
                    matchCount = total.coerceAtMost(100),
                )
            )
        }
        return signals
    }

    /** Gravité pondérée, avec plancher pour les catégories les plus sensibles. */
    fun severityOf(category: SafetyCategory, strongHits: Int, weakHits: Int): SafetySeverity {
        val score = strongHits * 2 + weakHits
        if (score <= 0) return SafetySeverity.LOW

        val highThreshold = when (category) {
            SafetyCategory.SELF_HARM -> 2       // un énoncé fort de détresse suffit
            SafetyCategory.SEXUAL_CONTENT -> 2  // une sollicitation explicite suffit
            SafetyCategory.GROOMING -> 3        // G4 : exige une COMBINAISON de motifs
            SafetyCategory.HARASSMENT -> 3      // répétition/accumulation
            SafetyCategory.DRUGS -> 3
        }
        if (score >= highThreshold) return SafetySeverity.HIGH

        val sensitive = category == SafetyCategory.SELF_HARM ||
            category == SafetyCategory.GROOMING ||
            category == SafetyCategory.SEXUAL_CONTENT
        if (sensitive && strongHits >= 1) return SafetySeverity.MEDIUM
        return if (score >= 2) SafetySeverity.MEDIUM else SafetySeverity.LOW
    }
}
