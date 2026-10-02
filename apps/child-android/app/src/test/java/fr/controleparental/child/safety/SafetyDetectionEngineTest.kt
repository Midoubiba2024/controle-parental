package fr.controleparental.child.safety

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests du moteur de détection de risque PUR (LOT 6). Couvre : la gravité pondérée
 * par catégorie, le plancher des catégories sensibles, la COMBINAISON de motifs de
 * grooming (G4 → HIGH), la normalisation (accents/ponctuation/casse), les cas
 * négatifs (pas de faux positif), l'agrégation du compteur, le multi-catégories.
 *
 * 🔴 Aucune assertion ne porte sur un contenu — uniquement sur catégorie/gravité/
 * compteur (le moteur ne renvoie jamais de texte).
 */
class SafetyDetectionEngineTest {

    private fun analyze(text: String) = SafetyDetectionEngine.analyze(text)

    private fun signalOf(text: String, category: SafetyCategory): SafetySignal? =
        analyze(text).firstOrNull { it.category == category }

    @Test fun blankTextReturnsNoSignal() {
        assertTrue(analyze("").isEmpty())
        assertTrue(analyze("    \n\t ").isEmpty())
    }

    @Test fun neutralTextReturnsNoSignal() {
        // Une conversation anodine ne doit produire AUCUN signal (pas de faux positif).
        assertTrue(analyze("On se voit au cinema demain avec les copains ? :)").isEmpty())
        assertTrue(analyze("N'oublie pas tes devoirs de maths pour lundi").isEmpty())
    }

    @Test fun harassmentSingleStrongIsMedium() {
        val s = signalOf("ferme ta gueule", SafetyCategory.HARASSMENT)
        assertEquals(SafetySeverity.MEDIUM, s?.severity)
    }

    @Test fun harassmentAccumulationIsHigh() {
        // Deux marqueurs forts → accumulation → HIGH.
        val s = signalOf("tue toi, personne ne t'aime", SafetyCategory.HARASSMENT)
        assertEquals(SafetySeverity.HIGH, s?.severity)
        assertEquals(2, s?.matchCount)
    }

    @Test fun selfHarmStrongStatementIsHigh() {
        // Un énoncé fort de détresse suffit pour une gravité haute (concern immédiat).
        assertEquals(SafetySeverity.HIGH, signalOf("je veux mourir", SafetyCategory.SELF_HARM)?.severity)
    }

    @Test fun selfHarmWeakOnlyIsLow() {
        assertEquals(SafetySeverity.LOW, signalOf("j'en peux plus", SafetyCategory.SELF_HARM)?.severity)
    }

    @Test fun groomingSingleMarkerIsMediumNotHigh() {
        // Un seul motif de grooming → MEDIUM (plancher sensible), PAS HIGH.
        val s = signalOf("envoie moi une photo", SafetyCategory.GROOMING)
        assertEquals(SafetySeverity.MEDIUM, s?.severity)
    }

    @Test fun groomingCombinationIsHigh() {
        // G4 : une COMBINAISON (secret fort + question d'âge faible) → HIGH.
        val s = signalOf("c'est notre secret, et quel âge as-tu ?", SafetyCategory.GROOMING)
        assertEquals(SafetySeverity.HIGH, s?.severity)
    }

    @Test fun sexualContentSolicitationIsHigh() {
        assertEquals(SafetySeverity.HIGH, signalOf("envoie des nudes", SafetyCategory.SEXUAL_CONTENT)?.severity)
    }

    @Test fun sexualContentWeakIsLow() {
        assertEquals(SafetySeverity.LOW, signalOf("tu es sexy", SafetyCategory.SEXUAL_CONTENT)?.severity)
    }

    @Test fun drugsWeakIsLowStrongIsMedium() {
        assertEquals(SafetySeverity.LOW, signalOf("tu as de la beuh ?", SafetyCategory.DRUGS)?.severity)
        assertEquals(SafetySeverity.MEDIUM, signalOf("je peux acheter de la cocaine", SafetyCategory.DRUGS)?.severity)
    }

    @Test fun normalizationHandlesAccentsCaseAndPunctuation() {
        // "déshabille-toi" (accent + tiret + casse) doit matcher "deshabille toi".
        assertEquals(SafetySeverity.HIGH, signalOf("DÉSHABILLE-TOI !!!", SafetyCategory.SEXUAL_CONTENT)?.severity)
        // Bornes de mots : "cannabisme" (mot plus long) ne doit PAS matcher "cannabis".
        assertNull(signalOf("le cannabisme est un sujet d'exposé", SafetyCategory.DRUGS))
        // Contrôle positif du tokenizer : "cannabis" isolé matche bien.
        assertTrue(analyze("il parle de cannabis").any { it.category == SafetyCategory.DRUGS })
    }

    @Test fun multipleCategoriesDetectedIndependently() {
        val signals = analyze("je veux mourir et tout le monde te deteste")
        val cats = signals.map { it.category }.toSet()
        assertTrue(cats.contains(SafetyCategory.SELF_HARM))
        assertTrue(cats.contains(SafetyCategory.HARASSMENT))
    }

    @Test fun matchCountAggregatesWithinCategory() {
        // Deux marqueurs de la même catégorie → compteur = 2, une seule entrée.
        val self = analyze("je veux mourir, j'en peux plus").filter { it.category == SafetyCategory.SELF_HARM }
        assertEquals(1, self.size)
        assertEquals(2, self.first().matchCount)
    }

    @Test fun severityOfIsPureAndThresholded() {
        // Appel direct de la fonction de gravité (comme PolicyEngine.windowActive).
        assertEquals(SafetySeverity.HIGH, SafetyDetectionEngine.severityOf(SafetyCategory.SELF_HARM, 1, 0))
        assertEquals(SafetySeverity.MEDIUM, SafetyDetectionEngine.severityOf(SafetyCategory.GROOMING, 1, 0))
        assertEquals(SafetySeverity.HIGH, SafetyDetectionEngine.severityOf(SafetyCategory.GROOMING, 1, 1))
        assertEquals(SafetySeverity.LOW, SafetyDetectionEngine.severityOf(SafetyCategory.DRUGS, 0, 1))
    }

    @Test fun wireLabelsMatchSqlEnums() {
        // Les libellés transmis doivent correspondre aux enums SQL (app.safety_*).
        assertEquals("self_harm", SafetyCategory.SELF_HARM.wire)
        assertEquals("sexual_content", SafetyCategory.SEXUAL_CONTENT.wire)
        assertEquals("high", SafetySeverity.HIGH.wire)
    }
}
