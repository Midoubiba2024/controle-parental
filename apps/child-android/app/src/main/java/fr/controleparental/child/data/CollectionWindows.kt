package fr.controleparental.child.data

/**
 * Fenêtres de collecte PURES (LOT 12b, minimisation) : rien d'antérieur à
 * l'appairage de CET appareil ne part, même au premier cycle et même si
 * l'appareil a déjà servi à un autre enfant. [enrolledAt] = 0 (enrôlement
 * antérieur au LOT 12b) : comportement inchangé.
 */
object CollectionWindows {

    /** Début de lecture du journal d'appels (epoch ms). */
    fun callsSince(watermark: Long, enrolledAt: Long): Long = maxOf(watermark, enrolledAt)

    /**
     * Sous-fenêtres VISIBLES d'un jour [[dayStart], [dayEnd]) : bornées à
     * l'appairage puis privées des coupures de supervision ([gaps]). Vide si rien
     * ne reste. L'usage du jour est la somme de ces sous-fenêtres.
     */
    fun visibleWindows(dayStart: Long, dayEnd: Long, enrolledAt: Long, gaps: List<VisibilityGaps.Gap>): List<Pair<Long, Long>> {
        val base = usageWindow(dayStart, dayEnd, enrolledAt) ?: return emptyList()
        var windows = listOf(base)
        for (g in gaps.sortedBy { it.from }) {
            windows = windows.flatMap { (a, b) ->
                if (g.to <= a || g.from >= b) listOf(a to b)
                else listOfNotNull((a to g.from).takeIf { g.from > a }, (g.to to b).takeIf { g.to < b })
            }
        }
        return windows
    }

    /** Un appel (ou tout événement daté) tombe-t-il dans une coupure ? Bornes [from, to). */
    fun inGap(ts: Long, gaps: List<VisibilityGaps.Gap>): Boolean = gaps.any { ts >= it.from && ts < it.to }

    /**
     * Fenêtre d'agrégation d'un jour [[dayStart], [dayEnd]) bornée à [enrolledAt] :
     * null si le jour est entièrement antérieur à l'appairage, sinon le début
     * ramené à l'appairage.
     */
    fun usageWindow(dayStart: Long, dayEnd: Long, enrolledAt: Long): Pair<Long, Long>? {
        if (dayEnd <= enrolledAt || dayEnd <= dayStart) return null
        return maxOf(dayStart, enrolledAt) to dayEnd
    }
}
