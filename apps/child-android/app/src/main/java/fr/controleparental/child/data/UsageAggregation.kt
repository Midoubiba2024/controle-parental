package fr.controleparental.child.data

/**
 * Agrégation PURE du temps de premier plan d'UNE sous-fenêtre visible
 * [[start], [end]) (tour 6 V5). Une session à cheval sur le DÉBUT de la
 * sous-fenêtre (fin d'une coupure) n'est pas perdue : le premier arrêt d'un
 * paquet sans reprise préalable dans la sous-fenêtre ouvre la session au début
 * de celle-ci (une seule fois par paquet). Les sessions encore ouvertes sont
 * closes à [end].
 */
object UsageAggregation {

    enum class Type { RESUMED, PAUSED }

    data class Event(val pkg: String, val type: Type, val ts: Long)

    data class Agg(var foregroundMs: Long = 0, var launches: Int = 0, var lastUsed: Long = 0)

    fun aggregate(events: List<Event>, start: Long, end: Long, into: MutableMap<String, Agg> = HashMap()): MutableMap<String, Agg> {
        val resumedAt = HashMap<String, Long>()
        val seen = HashSet<String>()
        for (ev in events) {
            when (ev.type) {
                Type.RESUMED -> {
                    resumedAt[ev.pkg] = ev.ts
                    seen += ev.pkg
                    val a = into.getOrPut(ev.pkg) { Agg() }
                    a.launches++
                    if (ev.ts > a.lastUsed) a.lastUsed = ev.ts
                }
                Type.PAUSED -> {
                    // Session commencée avant la sous-fenêtre : ouverte à son début.
                    val startedAt = resumedAt.remove(ev.pkg)
                        ?: if (seen.add(ev.pkg)) start else continue
                    val a = into.getOrPut(ev.pkg) { Agg() }
                    a.foregroundMs += (ev.ts - startedAt).coerceAtLeast(0)
                    if (ev.ts > a.lastUsed) a.lastUsed = ev.ts
                }
            }
        }
        for ((pkg, startedAt) in resumedAt) {
            into.getOrPut(pkg) { Agg() }.foregroundMs += (end - startedAt).coerceAtLeast(0)
        }
        return into
    }
}
