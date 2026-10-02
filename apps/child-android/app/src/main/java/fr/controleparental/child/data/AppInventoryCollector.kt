package fr.controleparental.child.data

import android.content.Context
import android.content.pm.LauncherApps
import android.os.Process

/**
 * Inventaire des apps installées via LauncherApps (apps LANÇABLES), ce qui évite
 * la permission large QUERY_ALL_PACKAGES. Métadonnées uniquement.
 */
class AppInventoryCollector(private val context: Context) {

    data class AppRow(
        val packageName: String,
        val appLabel: String?,
        val category: String?,
        val isSystem: Boolean,
        val installedAt: Long?,     // epoch ms (firstInstallTime) ou null
    )

    fun collect(): List<AppRow> {
        val launcher = context.getSystemService(Context.LAUNCHER_APPS_SERVICE) as LauncherApps
        val pm = context.packageManager
        val seen = HashSet<String>()
        val rows = mutableListOf<AppRow>()

        for (activity in launcher.getActivityList(null, Process.myUserHandle())) {
            val pkg = activity.applicationInfo.packageName
            if (pkg == context.packageName || !seen.add(pkg)) continue
            val info = activity.applicationInfo
            val installedAt = try {
                pm.getPackageInfo(pkg, 0).firstInstallTime
            } catch (_: Exception) {
                null
            }
            rows += AppRow(
                packageName = pkg,
                appLabel = activity.label?.toString(),
                category = AppMeta.categoryOf(info),
                isSystem = AppMeta.isSystem(info),
                installedAt = installedAt,
            )
        }
        return rows
    }
}
