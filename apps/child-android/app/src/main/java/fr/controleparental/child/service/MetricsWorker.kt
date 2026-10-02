package fr.controleparental.child.service

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import fr.controleparental.child.data.MetricsCollector
import fr.controleparental.child.data.SupervisionStore
import java.util.concurrent.TimeUnit

/**
 * Collecte périodique des AGRÉGATS d'observation (LOT 1) + remontée chiffrée.
 * Exécuté hors du thread UI, avec repli fiable sous Doze (WorkManager).
 */
class MetricsWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (!SupervisionStore(applicationContext).isEnrolled) return Result.success()
        val report = MetricsCollector(applicationContext).collectAndUpload()
        // En cas d'erreur réseau transitoire, laisser WorkManager réessayer.
        return if (report.errors.isEmpty()) Result.success() else Result.retry()
    }

    companion object {
        private const val PERIODIC = "metrics_periodic"
        private const val ONESHOT = "metrics_oneshot"

        private val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        /** Planifie la collecte régulière (toutes les ~heures) + un passage immédiat. */
        fun schedule(context: Context) {
            val periodic = PeriodicWorkRequestBuilder<MetricsWorker>(1, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC, ExistingPeriodicWorkPolicy.KEEP, periodic,
            )
            runNow(context)
        }

        /** Déclenche une collecte unique immédiate (ex. au démarrage du service). */
        fun runNow(context: Context) {
            val oneShot = OneTimeWorkRequestBuilder<MetricsWorker>()
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                ONESHOT, ExistingWorkPolicy.REPLACE, oneShot,
            )
        }
    }
}
