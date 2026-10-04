package fr.controleparental.child.safety

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Analyse bien-être bornée à l'appairage (LOT 12b) : aucun message reçu avant
 * l'appairage n'est analysé. Textes FICTIFS.
 */
class NotificationTextTest {

    private val enrolledAt = 1_000_000L

    @Test fun messagingStyleKeepsOnlyMessagesAfterPairing() {
        val msgs = listOf(
            NotificationText.Message(enrolledAt - 10, "ancien message"),
            NotificationText.Message(enrolledAt + 10, "nouveau message"),
        )
        val t = NotificationText.assemble(
            "Léa", "résumé", "grand résumé", null, msgs, null, postTime = enrolledAt + 20, enrolledAt = enrolledAt,
        )
        assertEquals("Léa nouveau message", t)
    }

    @Test fun messagingStyleWithOnlyOldMessagesGivesNothing() {
        val msgs = listOf(NotificationText.Message(enrolledAt - 10, "ancien message"))
        assertNull(NotificationText.assemble("Léa", "résumé", null, null, msgs, null, enrolledAt + 20, enrolledAt))
    }

    @Test fun messagingStyleKeepsTheMostRecentOnes() {
        val msgs = (1..5).map { NotificationText.Message(enrolledAt + it, "m$it") }
        assertEquals("m3 m4 m5", NotificationText.assemble(null, null, null, null, msgs, null, enrolledAt + 9, enrolledAt))
    }

    @Test fun inboxStyleIsAnalysedOnlyIfPostedAfterPairing() {
        val lines = listOf<CharSequence>("ligne 1", "ligne 2")
        assertNull(NotificationText.assemble("Boîte", null, null, null, null, lines, enrolledAt - 1, enrolledAt))
        assertEquals(
            "Boîte ligne 1 ligne 2",
            NotificationText.assemble("Boîte", null, null, null, null, lines, enrolledAt + 1, enrolledAt),
        )
    }

    @Test fun plainNotificationAfterPairing() {
        assertEquals("Titre texte", NotificationText.assemble("Titre", "texte", null, null, null, null, enrolledAt, enrolledAt))
        assertNull(NotificationText.assemble("Titre", "texte", null, null, null, null, enrolledAt - 1, enrolledAt))
        assertNull(NotificationText.assemble(null, " ", null, null, null, null, enrolledAt, enrolledAt))
    }

    @Test fun legacyEnrollmentWithoutPairingInstantIsUnbounded() {
        val msgs = listOf(NotificationText.Message(5, "message"))
        assertEquals("message", NotificationText.assemble(null, null, null, null, msgs, null, 10, enrolledAt = 0))
    }

    @Test fun cumulativeNotificationPresentBeforePairingIsNeverAnalysed() {
        // Inbox/BigText republiée après l'appairage, mais déjà présente avant (T3).
        val lines = listOf<CharSequence>("ancienne ligne")
        assertNull(
            NotificationText.assemble(
                "Boîte", "texte", "grand texte", null, null, lines, enrolledAt + 5, enrolledAt,
                presentBeforeEnrollment = true,
            ),
        )
        // MessagingStyle : filtré par date, la présence antérieure ne bloque pas les nouveaux messages.
        val msgs = listOf(NotificationText.Message(enrolledAt + 1, "nouveau"))
        assertEquals(
            "nouveau",
            NotificationText.assemble(null, null, null, null, msgs, null, enrolledAt + 5, enrolledAt, presentBeforeEnrollment = true),
        )
    }
}
