package fr.controleparental.child.data

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager

/** Utilitaires de résolution de métadonnées d'app (libellé, catégorie). */
object AppMeta {

    /** Catégorie lisible à partir d'ApplicationInfo.category (API 26+). */
    fun categoryOf(info: ApplicationInfo): String = when (info.category) {
        ApplicationInfo.CATEGORY_GAME -> "game"
        ApplicationInfo.CATEGORY_AUDIO -> "audio"
        ApplicationInfo.CATEGORY_VIDEO -> "video"
        ApplicationInfo.CATEGORY_IMAGE -> "image"
        ApplicationInfo.CATEGORY_SOCIAL -> "social"
        ApplicationInfo.CATEGORY_NEWS -> "news"
        ApplicationInfo.CATEGORY_MAPS -> "maps"
        ApplicationInfo.CATEGORY_PRODUCTIVITY -> "productivity"
        else -> "other"
    }

    fun isSystem(info: ApplicationInfo): Boolean =
        (info.flags and (ApplicationInfo.FLAG_SYSTEM or ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0

    /** Libellé + catégorie pour un package, ou null si introuvable/masqué. */
    fun resolve(pm: PackageManager, packageName: String): Pair<String, String>? = try {
        val info = pm.getApplicationInfo(packageName, 0)
        pm.getApplicationLabel(info).toString() to categoryOf(info)
    } catch (_: PackageManager.NameNotFoundException) {
        null
    }
}
