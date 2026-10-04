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
        // Invariant de transparence (LOT 12b) : aucune collecte sans notification de
        // supervision visible. Rien n'est rattrapé ensuite : la période sans
        // supervision visible est EXCLUE de toute collecte (VisibilityGaps).
        val visible = SupervisionService.supervisionVisible(applicationContext)
        // Coupure OBSERVÉE (ou retour) : enregistrée, puis exclue de la collecte.
        SupervisionStore(applicationContext).observeSupervision(visible)
        if (!visible) return Result.success()
        val report = MetricsCollector(applicationContext).collectAndUpload()
        // Les remontées sont idempotentes (upsert on_conflict pour usage_daily/
        // app_inventory/comm_events/device_status), donc un rejeu ne crée pas de
        // doublon. MAIS on ne rejoue que sur erreurs TRANSITOIRES (réseau, 5xx,
        // 408/429) : une erreur PERMANENTE (4xx RLS, CHECK violé) ne se résoudra
        // jamais d'elle-même → rejouer indéfiniment gaspillerait batterie/réseau.
        return when {
            report.errors.isEmpty() -> Result.success()
            report.errors.any { isTransient(it) } -> Result.retry()
            else -> Result.failure()   // erreurs permanentes : on arrête ce cycle
        }
    }

    companion object {
        private const val PERIODIC = "metrics_periodic"
        private const val ONESHOT = "metrics_oneshot"

        /**
         * Une erreur de remontée est-elle TRANSITOIRE (donc rejouable) ?
         * Codes du type "usage:http_503", "status:http_0" (réseau), "calls:refresh_…".
         * http_0 = exception réseau ; 408/429/5xx = transitoire ; 4xx = permanent.
         * Un code non reconnu (ni http_…) est traité comme transitoire par prudence.
         */
        fun isTransient(err: String): Boolean {
            val m = Regex("http_(\\d+)").find(err) ?: return true
            val code = m.groupValues[1].toIntOrNull() ?: return true
            return code == 0 || code == 408 || code == 429 || code >= 500
        }

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

        /** Désenrôlement : annule toute collecte planifiée (périodique et ponctuelle). */
        fun cancel(context: Context) {
            val wm = WorkManager.getInstance(context)
            wm.cancelUniqueWork(PERIODIC)
            wm.cancelUniqueWork(ONESHOT)
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
