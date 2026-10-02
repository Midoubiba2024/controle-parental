package fr.controleparental.child.safety

/**
 * LOT 6 — Modèles du moteur de détection de risque ON-DEVICE.
 *
 * 🔴 LIGNE ROUGE (docs/11-LOT6-BIEN-ETRE.md, docs/02-CONFORMITE.md) : ces modèles
 * ne transportent QUE des MÉTADONNÉES (catégorie, gravité, compteur). Aucun champ
 * ne contient — et ne doit jamais contenir — le texte analysé, un extrait, ou un
 * contenu de correspondance. Le texte reste une variable locale du moteur, détruite
 * après analyse.
 */

/** Catégorie de risque détectée. Les libellés `wire` correspondent à l'enum SQL
 *  `app.safety_category`. AUCUNE donnée de contenu — seulement la catégorie. */
enum class SafetyCategory(val wire: String) {
    HARASSMENT("harassment"),       // cyberharcèlement (insultes/menaces/exclusion)
    GROOMING("grooming"),           // motif de contact adulte inconnu / sollicitation (G4)
    SEXUAL_CONTENT("sexual_content"), // contenu sexuel / sollicitation de photos
    SELF_HARM("self_harm"),         // mal-être, auto-agression, idées suicidaires
    DRUGS("drugs"),                 // drogues / substances
}

/** Gravité de l'ALERTE (pas du contenu). Libellés `wire` = enum SQL `app.safety_severity`. */
enum class SafetySeverity(val wire: String) {
    LOW("low"),
    MEDIUM("medium"),
    HIGH("high"),
}

/**
 * Un signal = la SEULE chose qui sort du moteur (et, de là, du téléphone).
 * @param category catégorie de risque
 * @param severity gravité calculée
 * @param matchCount nombre de correspondances agrégées (compteur, pas de contenu)
 */
data class SafetySignal(
    val category: SafetyCategory,
    val severity: SafetySeverity,
    val matchCount: Int,
)

/**
 * Config de l'analyse, poussée par le backend (`safety_settings`) et l'état d'âge.
 * @param analysisEnabled l'analyse est consentie/activée (parent + assentiment ado)
 * @param teenProfile le profil est preteen/teen (young_child ⇒ false ⇒ jamais d'analyse)
 */
data class SafetyConfig(
    val analysisEnabled: Boolean,
    val teenProfile: Boolean,
) {
    /** Analyse réellement autorisée : gradation par âge ET consentement. */
    val active: Boolean get() = analysisEnabled && teenProfile

    companion object {
        /** Par défaut : désactivé (privacy by default, art. 25). */
        val DISABLED = SafetyConfig(analysisEnabled = false, teenProfile = false)
    }
}
