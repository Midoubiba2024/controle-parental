package fr.controleparental.child.data

import org.json.JSONArray
import org.json.JSONObject

/**
 * Coupures OBSERVÉES de la supervision visible (LOT 12b) — logique PURE.
 *
 * Une coupure n'est JAMAIS déduite d'un écart d'heure murale : la veille du
 * processeur (écran éteint, Doze) avec le service vivant et la notification
 * affichée n'en est pas une. Seuls comptent :
 *  - un constat « supervision non visible » (boucle du service, MetricsWorker) ;
 *  - un NOUVEAU processus ou un NOUVEAU démarrage sans état visible continu :
 *    la coupure part alors du dernier battement visible persisté.
 * Au retour à la visibilité, l'intervalle [début, maintenant) est ajouté à
 * [State.gaps] ; la collecte exclut ces intervalles (CollectionWindows) sans
 * jamais rien rattraper ni écraser à tort. Intervalles purgés après 3 jours.
 */
object VisibilityGaps {

    const val HEARTBEAT_MS = 60_000L
    const val RETENTION_MS = 3 * 24 * 3_600_000L

    data class Gap(val from: Long, val to: Long)

    data class State(
        val lastVisibleAt: Long = 0L,
        /** Début de la coupure en cours (0 = aucune). */
        val invisibleFrom: Long = 0L,
        val processToken: String? = null,
        val boot: Int = -1,
        val gaps: List<Gap> = emptyList(),
    )

    data class Step(val state: State, val persist: Boolean)

    fun observe(s: State, visible: Boolean, now: Long, processToken: String, boot: Int): Step {
        var st = s
        var persist = false
        // Nouveau processus / démarrage : la continuité n'est plus garantie depuis
        // le dernier battement persisté (le service et sa notification ont disparu).
        if (st.processToken != processToken || st.boot != boot) {
            if (st.invisibleFrom == 0L && st.lastVisibleAt > 0L) st = st.copy(invisibleFrom = st.lastVisibleAt)
            st = st.copy(processToken = processToken, boot = boot)
            persist = true
        }
        if (!visible) {
            if (st.invisibleFrom == 0L) {
                st = st.copy(invisibleFrom = if (st.lastVisibleAt > 0L) st.lastVisibleAt else now)
                persist = true
            }
        } else {
            if (st.invisibleFrom != 0L) {
                st = st.copy(gaps = st.gaps + Gap(st.invisibleFrom, now), invisibleFrom = 0L)
                persist = true
            }
            if (persist || now - st.lastVisibleAt >= HEARTBEAT_MS || now < st.lastVisibleAt) {
                st = st.copy(lastVisibleAt = now)
                persist = true
            }
        }
        // Purge (et intervalles incohérents après un recul d'horloge).
        val kept = st.gaps.filter { it.to > it.from && it.to >= now - RETENTION_MS }
        if (kept.size != st.gaps.size) { st = st.copy(gaps = kept); persist = true }
        return Step(st, persist)
    }

    /**
     * Intervalles à EXCLURE de la collecte : coupures closes + coupure en cours
     * (jusqu'à [now]).
     */
    fun excluded(s: State, now: Long): List<Gap> =
        if (s.invisibleFrom != 0L) s.gaps + Gap(s.invisibleFrom, now) else s.gaps

    fun gapsToJson(gaps: List<Gap>): String =
        JSONArray().apply { gaps.forEach { put(JSONObject().put("from", it.from).put("to", it.to)) } }.toString()

    fun gapsFromJson(json: String?): List<Gap> {
        val arr = runCatching { JSONArray(json ?: return emptyList()) }.getOrNull() ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            arr.optJSONObject(i)?.let { Gap(it.optLong("from"), it.optLong("to")) }
        }
    }
}
