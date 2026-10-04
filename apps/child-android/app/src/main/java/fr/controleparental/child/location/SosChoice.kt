package fr.controleparental.child.location

/**
 * Choix PUR du SOS à diffuser (tour 6 V2) entre le SOS local courant et le
 * précédent (tous deux déjà vérifiés dans leur fenêtre — SosWindow).
 *  - ligne courante présente → elle ;
 *  - erreur réseau → on garde le choix précédent [kept] ;
 *  - ligne courante ABSENTE (second SOS jamais créé) → le précédent, s'il existe
 *    encore côté serveur (erreur → [kept], absent → aucun).
 */
object SosChoice {

    enum class RowState { PRESENT, ABSENT, ERROR }

    fun next(
        currentId: String?,
        currentState: RowState,
        previousId: String?,
        previousState: RowState?,
        kept: String?,
    ): String? = when (currentState) {
        RowState.PRESENT -> currentId
        RowState.ERROR -> kept
        RowState.ABSENT -> when (previousState) {
            RowState.PRESENT -> previousId
            RowState.ERROR -> kept
            RowState.ABSENT, null -> null
        }
    }
}
