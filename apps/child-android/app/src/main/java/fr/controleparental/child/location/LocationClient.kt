package fr.controleparental.child.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.Granularity
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.tasks.Tasks
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * LOT 3 — Récupération de position via FusedLocationProviderClient.
 *
 * On privilégie des relevés PONCTUELS (getCurrentLocation one-shot) plutôt qu'un
 * flux continu : plus économe en batterie, plus résistant à Doze, et surtout plus
 * respectueux de la minimisation (on ne capte une position que quand c'est utile —
 * check-in, SOS, cadence périodique pilotée par le parent).
 *
 * Aucune localisation occulte : la notification de supervision persistante (K1)
 * est toujours affichée, et l'écran « mes données » explique quand/comment la
 * position est partagée.
 */
class LocationClient(private val context: Context) {

    private val fused = LocationServices.getFusedLocationProviderClient(context)

    fun hasAnyLocationPermission(): Boolean =
        hasFine() || ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED

    fun hasFine(): Boolean = ContextCompat.checkSelfPermission(
        context, Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED

    fun hasBackground(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_BACKGROUND_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Un relevé ponctuel. [highAccuracy] = GPS précis (plus de batterie) sinon
     * compromis batterie/précision. Retourne null si permission absente, timeout,
     * ou erreur. S'exécute hors du thread principal.
     */
    @SuppressLint("MissingPermission")  // garde-fou runtime : hasAnyLocationPermission()
    suspend fun currentFix(highAccuracy: Boolean): Location? = withContext(Dispatchers.IO) {
        if (!hasAnyLocationPermission()) return@withContext null
        val priority = if (highAccuracy) Priority.PRIORITY_HIGH_ACCURACY
        else Priority.PRIORITY_BALANCED_POWER_ACCURACY
        val req = CurrentLocationRequest.Builder()
            .setPriority(priority)
            .setGranularity(Granularity.GRANULARITY_PERMISSION_LEVEL)
            .setMaxUpdateAgeMillis(30_000L)        // accepte un relevé récent du cache
            .setDurationMillis(20_000L)            // borne le temps d'acquisition
            .build()
        val cts = CancellationTokenSource()
        try {
            Tasks.await(fused.getCurrentLocation(req, cts.token))
                ?: runCatching { Tasks.await(fused.lastLocation) }.getOrNull()
        } catch (_: Exception) {
            cts.cancel()
            runCatching { Tasks.await(fused.lastLocation) }.getOrNull()
        }
    }

    /** Dernière position connue (cache système), sans nouvelle acquisition. */
    @SuppressLint("MissingPermission")  // garde-fou runtime : hasAnyLocationPermission()
    suspend fun lastKnown(): Location? = withContext(Dispatchers.IO) {
        if (!hasAnyLocationPermission()) return@withContext null
        try {
            Tasks.await(fused.lastLocation)
        } catch (_: Exception) {
            null
        }
    }
}
