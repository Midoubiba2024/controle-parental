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
     * Borne basse de collecte : appairage ET dernier retour à la visibilité de la
     * supervision (T2) — rien de ce qui s'est passé pendant une période sans
     * notification visible n'est rattrapé ensuite (échec fermé).
     */
    fun notBefore(enrolledAt: Long, visibleSince: Long): Long = maxOf(enrolledAt, visibleSince)

    /**
     * Instant d'appairage relu : s'il est dans le futur (horloge corrigée en
     * arrière), il est ramené à [nowMs] et [toPersist] indique la valeur à
     * réécrire — sinon toutes les positions (SOS compris) seraient rejetées.
     */
    data class Clamp(val effective: Long, val toPersist: Long?)

    fun clampEnrolledAt(stored: Long, nowMs: Long): Clamp =
        if (stored > nowMs) Clamp(nowMs, nowMs) else Clamp(stored, null)

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
