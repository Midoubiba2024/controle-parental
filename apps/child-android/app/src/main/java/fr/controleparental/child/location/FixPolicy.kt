package fr.controleparental.child.location

/**
 * Acceptation PURE d'un relevé de position (LOT 12b, tour 6 V1).
 *  - toute source : capturé après l'appairage ;
 *  - SOS : accepté aussi s'il est FRAIS en temps MONOTONE (âge depuis le
 *    démarrage ≤ 2 min) — une horloge en retard sur l'appairage ne bloque donc
 *    jamais un SOS, mais un relevé en cache d'avant l'appairage (repli
 *    lastLocation sans limite d'âge) est refusé.
 * [ageNs] : null si le relevé ne porte pas d'horodatage monotone.
 */
object FixPolicy {

    const val SOS_MAX_AGE_NS = 2 * 60 * 1_000_000_000L

    fun accept(source: String, capturedAtMs: Long, enrolledAt: Long, ageNs: Long?): Boolean {
        if (source == "sos" && ageNs != null && ageNs in 0..SOS_MAX_AGE_NS) return true
        return capturedAtMs >= enrolledAt
    }
}
