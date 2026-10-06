package fr.controleparental.child.location

/**
 * Diffusion SOS en direct (LOT 12b, T1) : uniquement pour le SOS déclenché SUR
 * CET APPAREIL par l'enfant (identifiant généré localement), et dans la fenêtre
 * de diffusion mesurée en temps ÉCOULÉ depuis le démarrage (insensible à
 * l'horloge murale) — jamais pour une ligne rouverte côté serveur.
 */
object SosWindow {

    fun isLive(
        rowId: String?,
        localId: String?,
        localBoot: Int,
        currentBoot: Int,
        startedElapsedMs: Long,
        nowElapsedMs: Long,
        maxMs: Long,
    ): Boolean {
        if (rowId.isNullOrEmpty() || localId.isNullOrEmpty() || rowId != localId) return false
        // Redémarrage : le temps écoulé repart de zéro, la fenêtre n'est plus mesurable.
        if (localBoot != currentBoot) return false
        val elapsed = nowElapsedMs - startedElapsedMs
        return elapsed in 0..maxMs
    }
}
