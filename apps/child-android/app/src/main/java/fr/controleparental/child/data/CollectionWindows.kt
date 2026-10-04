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
     * Fenêtre d'agrégation d'un jour [[dayStart], [dayEnd]) bornée à [enrolledAt] :
     * null si le jour est entièrement antérieur à l'appairage, sinon le début
     * ramené à l'appairage.
     */
    fun usageWindow(dayStart: Long, dayEnd: Long, enrolledAt: Long): Pair<Long, Long>? {
        if (dayEnd <= enrolledAt || dayEnd <= dayStart) return null
        return maxOf(dayStart, enrolledAt) to dayEnd
    }
}
