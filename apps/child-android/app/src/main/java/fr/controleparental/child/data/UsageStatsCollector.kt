package fr.controleparental.child.data

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process
import java.util.Calendar
import java.util.TimeZone

/**
 * Lecture du TEMPS D'ÉCRAN via UsageStatsManager, agrégé PAR APP ET PAR JOUR.
 *
 * Minimisation (RGPD art. 5-1-c) : on ne conserve que des agrégats journaliers
 * (durée de premier plan, nombre de lancements, dernier usage) — jamais le
 * détail horodaté des sessions, ni aucun contenu.
 *
 * La permission PACKAGE_USAGE_STATS est SPÉCIALE : elle n'est pas accordée au
 * runtime mais dans Réglages → « Accès aux données d'usage ».
 */
class UsageStatsCollector(private val context: Context) {

    data class UsageRow(
        val day: String,            // YYYY-MM-DD (fuseau local)
        val packageName: String,
        val appLabel: String?,
        val category: String?,
        val totalForegroundMs: Long,
        val launchCount: Int,
        val lastUsedAt: Long,       // epoch ms
    )

    /** La permission d'accès aux données d'usage est-elle accordée ? */
    fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.unsafeCheckOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName,
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /**
     * Collecte les agrégats des [daysBack] derniers jours (aujourd'hui inclus).
     * Retourne une ligne par (jour, package) réellement utilisé.
     */
    fun collect(daysBack: Int = 3): List<UsageRow> {
        if (!hasUsageAccess()) return emptyList()
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val pm = context.packageManager
        val rows = mutableListOf<UsageRow>()

        for (offset in 0 until daysBack) {
            val (start, end, dayLabel) = dayBounds(offset)
            // Agrégation à partir des évènements (durée de premier plan + lancements).
            val agg = HashMap<String, Agg>()
            val events = usm.queryEvents(start, end)
            val ev = UsageEvents.Event()
            val resumedAt = HashMap<String, Long>()
            while (events.getNextEvent(ev)) {
                val pkg = ev.packageName ?: continue
                when (ev.eventType) {
                    UsageEvents.Event.ACTIVITY_RESUMED,
                    UsageEvents.Event.MOVE_TO_FOREGROUND -> {
                        resumedAt[pkg] = ev.timeStamp
                        val a = agg.getOrPut(pkg) { Agg() }
                        a.launches++
                        if (ev.timeStamp > a.lastUsed) a.lastUsed = ev.timeStamp
                    }
                    UsageEvents.Event.ACTIVITY_PAUSED,
                    UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                        val startedAt = resumedAt.remove(pkg) ?: continue
                        val a = agg.getOrPut(pkg) { Agg() }
                        a.foregroundMs += (ev.timeStamp - startedAt).coerceAtLeast(0)
                        if (ev.timeStamp > a.lastUsed) a.lastUsed = ev.timeStamp
                    }
                }
            }
            // Fermer les sessions encore ouvertes à la fin de la fenêtre.
            for ((pkg, startedAt) in resumedAt) {
                val a = agg.getOrPut(pkg) { Agg() }
                a.foregroundMs += (end - startedAt).coerceAtLeast(0)
            }

            for ((pkg, a) in agg) {
                if (a.foregroundMs <= 0 && a.launches == 0) continue
                if (pkg == context.packageName) continue // ne pas remonter notre propre app
                val meta = AppMeta.resolve(pm, pkg)
                rows += UsageRow(
                    day = dayLabel,
                    packageName = pkg,
                    appLabel = meta?.first,
                    category = meta?.second,
                    totalForegroundMs = a.foregroundMs,
                    launchCount = a.launches,
                    lastUsedAt = a.lastUsed,
                )
            }
        }
        return rows
    }

    private class Agg {
        var foregroundMs: Long = 0
        var launches: Int = 0
        var lastUsed: Long = 0
    }

    /** Bornes [minuit, minuit+1j) du jour à J-[offset], + libellé YYYY-MM-DD. */
    private fun dayBounds(offset: Int): Triple<Long, Long, String> {
        val tz = TimeZone.getDefault()
        val cal = Calendar.getInstance(tz).apply {
            add(Calendar.DAY_OF_YEAR, -offset)
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        val start = cal.timeInMillis
        val label = "%04d-%02d-%02d".format(
            cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH),
        )
        cal.add(Calendar.DAY_OF_YEAR, 1)
        val end = minOf(cal.timeInMillis, System.currentTimeMillis())
        return Triple(start, end, label)
    }
}
