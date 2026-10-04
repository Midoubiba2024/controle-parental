package fr.controleparental.child.safety

/**
 * Assemblage PUR du texte d'une notification à analyser SUR L'APPAREIL (LOT 6),
 * borné à l'appairage (LOT 12b) : aucun message reçu AVANT l'appairage de cet
 * appareil n'est analysé.
 *  - MessagingStyle : seuls les messages datés d'après l'appairage (les plus
 *    récents) ; EXTRA_TEXT / EXTRA_BIG_TEXT ignorés (ils résument souvent
 *    d'anciens messages) ;
 *  - autres styles (dont InboxStyle, lignes non datées) : seulement si la
 *    notification a été publiée après l'appairage.
 * Renvoie null s'il ne reste rien. 🔴 Le texte reste strictement local.
 */
object NotificationText {

    data class Message(val timestamp: Long, val text: CharSequence?)

    fun assemble(
        title: CharSequence?,
        text: CharSequence?,
        bigText: CharSequence?,
        subText: CharSequence?,
        messages: List<Message>?,
        inboxLines: List<CharSequence>?,
        postTime: Long,
        enrolledAt: Long,
        recent: Int = 3,
        /**
         * La notification (même clé) existait déjà avant l'appairage (T3) : une
         * notification cumulative republiée (Inbox, BigText) contient alors des
         * messages anciens non datés — jamais analysée hors MessagingStyle.
         */
        presentBeforeEnrollment: Boolean = false,
    ): String? {
        val parts = mutableListOf<CharSequence>()
        if (messages != null) {
            val kept = messages.filter { it.timestamp >= enrolledAt && !it.text.isNullOrBlank() }.takeLast(recent)
            if (kept.isEmpty()) return null
            title?.let { parts += it }
            kept.forEach { parts += it.text!! }
        } else {
            if (postTime < enrolledAt || presentBeforeEnrollment) return null
            listOfNotNull(title, text, bigText, subText).forEach { parts += it }
            inboxLines?.takeLast(recent)?.forEach { parts += it }
        }
        return parts.joinToString(" ").trim().ifBlank { null }
    }
}
