package fr.controleparental.child.data

/**
 * Suivi PUR de la visibilité de la supervision (LOT 12b, T2) : un battement
 * [lastVisibleAt] est noté tant que la notification de supervision est visible.
 * Au premier constat « visible » après une interruption (notification coupée,
 * processus arrêté, redémarrage, horloge reculée), [visibleSince] repart de
 * maintenant : la collecte ne rattrape jamais la période sans supervision visible.
 */
object VisibilityWindow {

    /** Au-delà, l'absence de battement est une interruption. */
    const val GAP_MS = 5 * 60_000L

    /** Battement écrit au plus une fois par minute (stockage chiffré). */
    const val HEARTBEAT_MS = 60_000L

    data class State(val visibleSince: Long, val lastVisibleAt: Long)

    /**
     * Nouvel état après un constat « visible » à [now]. [resetAt] non nul :
     * reprise après interruption — la collecte (usage, appels) repart de là.
     * [persist] : l'état doit être écrit.
     */
    data class Step(val state: State, val resetAt: Long?, val persist: Boolean)

    fun onVisible(s: State, now: Long): Step {
        val interrupted = s.lastVisibleAt == 0L || now < s.lastVisibleAt || now - s.lastVisibleAt > GAP_MS
        if (interrupted) return Step(State(visibleSince = now, lastVisibleAt = now), resetAt = now, persist = true)
        val beat = now - s.lastVisibleAt >= HEARTBEAT_MS
        return Step(if (beat) s.copy(lastVisibleAt = now) else s, resetAt = null, persist = beat)
    }
}
