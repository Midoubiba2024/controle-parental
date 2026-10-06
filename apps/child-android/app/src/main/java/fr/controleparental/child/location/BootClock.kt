package fr.controleparental.child.location

import android.content.Context
import android.os.SystemClock
import android.provider.Settings

/**
 * Temps insensible à l'horloge murale (T1) : temps écoulé depuis le démarrage +
 * compteur de démarrages, pour mesurer la fenêtre de diffusion d'un SOS même si
 * l'heure du téléphone est modifiée.
 */
object BootClock {
    fun elapsedMs(): Long = SystemClock.elapsedRealtime()

    fun bootCount(context: Context): Int =
        runCatching { Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT) }.getOrDefault(-1)
}
