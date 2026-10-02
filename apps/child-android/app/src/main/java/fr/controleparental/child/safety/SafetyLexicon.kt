package fr.controleparental.child.safety

import java.text.Normalizer

/**
 * LOT 6 — Lexique de risque (FR) + motifs, pour la détection ON-DEVICE.
 *
 * Même esprit que `filter/DomainLists.kt` : ce sont des **listes de démonstration**
 * (seed), volontairement courtes et lisibles. En production elles doivent être
 * remplacées/enrichies par une source maintenue (lexiques validés, variantes,
 * argot), idéalement synchronisée et versionnée — jamais codée en dur à l'échelle.
 *
 * 🔴 LIGNE ROUGE : ce fichier ne fait QUE comparer un texte (passé en mémoire) à des
 * motifs. Il n'écrit rien, ne journalise rien, ne renvoie aucun extrait — seulement
 * des compteurs de correspondances par catégorie. Aucune I/O.
 *
 * Deux niveaux par catégorie :
 *   - `strong` : marqueurs à forte valeur (poids 2)
 *   - `weak`   : marqueurs d'appoint / contextuels (poids 1)
 * La gravité finale est calculée par le moteur à partir du score pondéré.
 */
object SafetyLexicon {

    /** Marqueurs « forts » par catégorie (déjà normalisés : minuscules, sans accents). */
    val strong: Map<SafetyCategory, List<String>> = mapOf(
        SafetyCategory.HARASSMENT to listOf(
            "tue toi", "va te pendre", "suicide toi", "personne ne t aime",
            "t es qu une merde", "ferme ta gueule", "sale pute", "on va te frapper",
            "tout le monde te deteste",
        ),
        SafetyCategory.GROOMING to listOf(
            "ne dis pas a tes parents", "c est notre secret", "garde le secret",
            "supprime ce message", "envoie moi une photo", "tu es seul chez toi",
            "on se voit en vrai", "ne le dis a personne", "efface la conversation",
        ),
        SafetyCategory.SEXUAL_CONTENT to listOf(
            "envoie des nudes", "envoie un nude", "photo nue", "photo de toi nu",
            "montre ton corps", "envoie une photo sexy", "deshabille toi",
        ),
        SafetyCategory.SELF_HARM to listOf(
            "je veux mourir", "je veux en finir", "me suicider", "plus envie de vivre",
            "me faire du mal", "me scarifier", "j aimerais disparaitre", "en finir avec la vie",
        ),
        SafetyCategory.DRUGS to listOf(
            "acheter de la coke", "vendre de la beuh", "de la cocaine", "de l ecstasy",
            "des cachets de mdma", "du lsd", "dealer de la drogue",
        ),
    )

    /** Marqueurs « faibles » / d'appoint (poids 1). */
    val weak: Map<SafetyCategory, List<String>> = mapOf(
        SafetyCategory.HARASSMENT to listOf(
            "t es nul", "grosse vache", "tu fais pitie", "degage", "casse toi",
            "ntm", "boloss", "tocard",
        ),
        SafetyCategory.GROOMING to listOf(
            "quel age as tu", "tu habites ou", "tu es tellement mature", "tu me plais",
            "rendez vous", "entre nous", "tu es seule",
        ),
        SafetyCategory.SEXUAL_CONTENT to listOf(
            "tu es sexy", "nude", "nudes", "photo coquine", "sans vetements",
        ),
        SafetyCategory.SELF_HARM to listOf(
            "j en peux plus", "je me deteste", "je suis un fardeau", "tout est noir",
            "je n y arrive plus",
        ),
        SafetyCategory.DRUGS to listOf(
            "beuh", "shit", "cannabis", "joint", "ecsta", "defonce", "pilule",
        ),
    )

    /**
     * Normalise un texte pour la comparaison (PUR) :
     *   minuscules → suppression des diacritiques → tout caractère non alphanumérique
     *   devient une espace → espaces compressés → bords entourés d'espaces (bornes de mots).
     * Ex. "T'ES NUL !!" → " t es nul ".
     */
    fun normalize(text: String): String {
        val lowered = text.lowercase()
        val stripped = Normalizer.normalize(lowered, Normalizer.Form.NFD)
            .replace(DIACRITICS, "")
        val spaced = NON_ALNUM.replace(stripped, " ")
        val collapsed = MULTISPACE.replace(spaced, " ").trim()
        return " $collapsed "
    }

    /**
     * Compte combien de marqueurs de [markers] apparaissent dans [normalizedPadded]
     * (déjà normalisé + entouré d'espaces). Correspondance par bornes de mots :
     * on recherche " marqueur " pour éviter les sous-chaînes trompeuses.
     * Chaque marqueur distinct compte au plus une fois.
     */
    fun countMatches(normalizedPadded: String, markers: List<String>): Int {
        var n = 0
        for (m in markers) {
            if (normalizedPadded.contains(" $m ")) n++
        }
        return n
    }

    private val DIACRITICS = "\\p{InCombiningDiacriticalMarks}+".toRegex()
    private val NON_ALNUM = "[^a-z0-9]+".toRegex()
    private val MULTISPACE = "\\s+".toRegex()
}
