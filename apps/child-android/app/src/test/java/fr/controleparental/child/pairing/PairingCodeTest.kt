package fr.controleparental.child.pairing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Normalisation / validation du code d'appairage (docs/14-APPAIRAGE.md §1),
 * alignées sur `app.pairing_code_normalize` côté serveur. Codes FICTIFS.
 */
class PairingCodeTest {

    @Test fun groupedFormIsNormalized() {
        assertEquals("7KQ2MX9D4F", PairingCode.normalize("7KQ2M-X9D4F"))
        assertTrue(PairingCode.isValid("7KQ2M-X9D4F"))
    }

    @Test fun lowercaseWithDashOrSpaceIsAccepted() {
        assertEquals("7KQ2MX9D4F", PairingCode.normalize("7kq2m-x9d4f"))
        assertEquals("7KQ2MX9D4F", PairingCode.normalize("7kq2m x9d4f"))
        assertTrue(PairingCode.isValid("7kq2m x9d4f"))
    }

    @Test fun crockfordEquivalencesAreApplied() {
        // Cas du contrat : O→0, I→1, L→1, majuscules, espaces et tirets ignorés.
        assertEquals("0A1B0C1D2E", PairingCode.normalize("oa-Ib OC-lD 2e"))
        assertTrue(PairingCode.isValid("oa-Ib OC-lD 2e"))
    }

    @Test fun unicodeSpacesAndDashesFromClipboardAreIgnored() {
        val pasted = "\u00A07KQ2M\u2013X9D4F\u200B\n" // insécable, tiret demi-cadratin, largeur nulle
        assertEquals("7KQ2MX9D4F", PairingCode.normalize(pasted))
        assertTrue(PairingCode.isValid(pasted))
        assertTrue(PairingCode.isValid("7KQ2M\u2212X9D4F" + Char(0xFEFF) + "\t"))
    }

    @Test fun letterUIsRefused() {
        assertFalse(PairingCode.isValid("7KQ2M-X9D4U"))
        assertFalse(PairingCode.isValid("UUUUUUUUUU"))
    }

    @Test fun wrongLengthIsRefused() {
        assertFalse(PairingCode.isValid("7KQ2M-X9D4"))     // 9
        assertFalse(PairingCode.isValid("7KQ2M-X9D4FA"))   // 11
        assertFalse(PairingCode.isValid(""))
        assertFalse(PairingCode.isValid("12345678"))       // ancien format 8 chiffres
    }

    @Test fun otherCharactersAreRefused() {
        assertFalse(PairingCode.isValid("7KQ2M_X9D4F"))
        assertFalse(PairingCode.isValid("7KQ2M.X9D4F"))
        assertFalse(PairingCode.isValid("7KQ2MÉX9D4"))
    }

    @Test fun typingFilterNormalizesAndCapsAtTenCharacters() {
        assertEquals(PairingCode.Input("7KQ2MX9D4F", false), PairingCode.sanitizeInput("7kq2m x9d4f"))
        assertEquals(PairingCode.Input("7KQ2MX9D4F", false), PairingCode.sanitizeInput("7KQ2M-X9D4F"))
        assertEquals(PairingCode.Input("0A1B0C1D2E", false), PairingCode.sanitizeInput("oa-Ib OC-lD 2e"))
        // Au-delà de 10 caractères significatifs, la frappe est ignorée.
        assertEquals("7KQ2MX9D4F", PairingCode.sanitizeInput("7KQ2MX9D4FZZ").code)
    }

    @Test fun typingFilterRejectsUAndOtherCharacters() {
        assertEquals(PairingCode.Input("7KQ", true), PairingCode.sanitizeInput("7KQu"))
        assertEquals(PairingCode.Input("7KQ", true), PairingCode.sanitizeInput("7K_Q"))
        assertEquals(PairingCode.Input("7KQ", false), PairingCode.sanitizeInput("7K Q"))
    }

    @Test fun groupedDisplayInsertsDashAfterFifthCharacter() {
        assertEquals("7KQ2M", PairingCode.grouped("7KQ2M"))
        assertEquals("7KQ2M-X", PairingCode.grouped("7KQ2MX"))
        assertEquals("7KQ2M-X9D4F", PairingCode.grouped("7KQ2MX9D4F"))
    }

    @Test fun cursorMappingRoundTrips() {
        for (len in 0..10) {
            for (o in 0..len) {
                val t = PairingCode.originalToGrouped(o, len)
                assertTrue(t <= PairingCode.grouped("A".repeat(len)).length)
                assertEquals(o, PairingCode.groupedToOriginal(t, len))
            }
        }
        // Curseur placé juste après le tiret affiché → après le 5e caractère.
        assertEquals(5, PairingCode.groupedToOriginal(6, 10))
    }

    @Test fun unicodeUppercaseMatchesSqlUpper() {
        // `ı` (i sans point) → I → 1 ; `ſ` (s long) → S, comme upper() côté serveur.
        assertEquals("1", PairingCode.normalize("\u0131"))
        assertEquals("S", PairingCode.normalize("\u017F"))
        assertEquals(PairingCode.Input("1S", false), PairingCode.sanitizeInput("\u0131\u017F"))
        assertTrue(PairingCode.isValid("7kq2m-x9d4\u017F"))
    }

    // --- applyEdit : sélection conservée, collage sur champ plein ----------------

    @Test fun pastingNewCodeIntoFullFieldReplacesIt() {
        val old = "ABCDEFGHJK"
        val pasted = "7KQ2M-X9D4F"
        val after = old + pasted                       // curseur en fin de champ plein
        val e = PairingCode.applyEdit(old, 10, 10, after, after.length, after.length)
        assertEquals(PairingCode.Edit("7KQ2MX9D4F", 10, 10, false), e)
    }

    @Test fun pastingNewCodeInTheMiddleOfFullFieldReplacesIt() {
        val old = "ABCDEFGHJK"
        val after = "ABCDE" + "7kq2m x9d4f" + "FGHJK"
        val e = PairingCode.applyEdit(old, 5, 5, after, 16, 16)
        assertEquals("7KQ2MX9D4F", e.code)
        assertEquals(10, e.selStart)
    }

    @Test fun pasteOverSelectAllReplacesEverything() {
        val e = PairingCode.applyEdit("ABCDEFGHJK", 0, 10, "7KQ2M-X9D4F", 11, 11)
        assertEquals(PairingCode.Edit("7KQ2MX9D4F", 10, 10, false), e)
    }

    @Test fun selectAllIsPreserved() {
        // Simple changement de sélection (« Tout sélectionner ») : rien n'est écrasé.
        val e = PairingCode.applyEdit("ABCDEFGHJK", 10, 10, "ABCDEFGHJK", 0, 10)
        assertEquals(PairingCode.Edit("ABCDEFGHJK", 0, 10, false), e)
    }

    @Test fun typingInTheMiddleKeepsCursorAfterTypedChar() {
        // « ABC|DE » + frappe « x » → « ABCXDE », curseur après le X.
        val e = PairingCode.applyEdit("ABCDE", 3, 3, "ABCxDE", 4, 4)
        assertEquals(PairingCode.Edit("ABCXDE", 4, 4, false), e)
    }

    @Test fun typingSeparatorDoesNotMoveCursorBackwards() {
        val e = PairingCode.applyEdit("ABCDE", 5, 5, "ABCDE-", 6, 6)
        assertEquals(PairingCode.Edit("ABCDE", 5, 5, false), e)
    }

    @Test fun typingIntoFullFieldIsRefused() {
        val e = PairingCode.applyEdit("ABCDEFGHJK", 5, 5, "ABCDEZFGHJK", 6, 6)
        assertEquals(PairingCode.Edit("ABCDEFGHJK", 5, 5, false), e)
    }

    @Test fun typingUIsRejectedAndCursorStays() {
        val e = PairingCode.applyEdit("ABC", 3, 3, "ABCu", 4, 4)
        assertEquals(PairingCode.Edit("ABC", 3, 3, true), e)
    }

    @Test fun deletingKeepsCursor() {
        val e = PairingCode.applyEdit("ABCDE", 3, 3, "ABDE", 2, 2)
        assertEquals(PairingCode.Edit("ABDE", 2, 2, false), e)
    }
}
