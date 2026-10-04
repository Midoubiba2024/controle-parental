package fr.controleparental.child.data

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import java.util.Calendar
import java.util.Locale
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
        // unsafeCheckOpNoThrow() n'existe qu'à partir de l'API 29 ; sous API 29
        // (minSdk = 26, soit Android 8–9) il faut utiliser checkOpNoThrow(),
        // sinon NoSuchMethodError au runtime.
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /**
     * Collecte les agrégats des [daysBack] derniers jours (aujourd'hui inclus),
     * jamais avant [notBefore] (instant d'appairage, LOT 12b ; 0 = sans borne) et
     * HORS des coupures de supervision [gaps] : chaque jour est la somme de ses
     * sous-fenêtres visibles (CollectionWindows.visibleWindows) — rien n'est
     * rattrapé, une coupure sous-estime le jour (échec fermé). Une ligne par
     * (jour, package) réellement utilisé.
     */
    fun collect(daysBack: Int = 3, notBefore: Long = 0L, gaps: List<VisibilityGaps.Gap> = emptyList()): List<UsageRow> {
        if (!hasUsageAccess()) return emptyList()
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val pm = context.packageManager
        val rows = mutableListOf<UsageRow>()

        for (offset in 0 until daysBack) {
            val (dayStart, dayEnd, dayLabel) = dayBounds(offset)
            val windows = CollectionWindows.visibleWindows(dayStart, dayEnd, notBefore, gaps)
            if (windows.isEmpty()) continue
            // Agrégation à partir des évènements (durée de premier plan + lancements),
            // sous-fenêtre visible par sous-fenêtre visible.
            val agg = HashMap<String, Agg>()
            for ((start, end) in windows) {
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
                // Fermer les sessions encore ouvertes à la fin de la sous-fenêtre.
                for ((pkg, startedAt) in resumedAt) {
                    val a = agg.getOrPut(pkg) { Agg() }
                    a.foregroundMs += (end - startedAt).coerceAtLeast(0)
                }
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
        // Locale.ROOT : calendrier grégorien et chiffres ASCII quelle que soit la langue
        // de l'appareil (ex. arabe/persan, bouddhiste en th) — la clé `day` part au backend.
        val cal = Calendar.getInstance(tz, Locale.ROOT).apply {
            add(Calendar.DAY_OF_YEAR, -offset)
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        val start = cal.timeInMillis
        val label = String.format(
            Locale.ROOT, "%04d-%02d-%02d",
            cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH),
        )
        cal.add(Calendar.DAY_OF_YEAR, 1)
        val end = minOf(cal.timeInMillis, System.currentTimeMillis())
        return Triple(start, end, label)
    }
}
