package fr.controleparental.child.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.core.content.ContextCompat
import fr.controleparental.child.Config

/**
 * Journal d'appels — MÉTADONNÉES UNIQUEMENT (qui/quand/durée).
 *
 * LIGNE ROUGE (docs/02-CONFORMITE.md) : jamais le contenu, jamais d'enregistrement,
 * jamais le nom du contact en clair. Seuls le numéro — immédiatement haché — le
 * sens, la durée et la date sont collectés. Fonction SENSIBLE (READ_CALL_LOG) :
 * désactivée par défaut (Config.featureCallLog) et conditionnée au consentement
 * runtime. Visible par l'enfant dans l'écran « mes données ».
 *
 * ATTENTION : le hachage effectué ici est LOCAL et son poivre est compilé dans
 * l'APK, donc réversible par force brute (voir Config.commHashPepper). Il ne doit
 * PAS être considéré comme une protection du numéro : avant toute activation en
 * release, le hachage/HMAC doit être déplacé côté serveur (Edge Function).
 */
class CallLogCollector(private val context: Context) {

    data class CallRow(
        val direction: String,      // incoming/outgoing/missed/rejected/blocked
        val counterpartyHash: String?,
        val durationMs: Long,
        val occurredAt: Long,       // epoch ms
    )

    fun isEnabledAndGranted(): Boolean =
        Config.featureCallLog && ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_CALL_LOG,
        ) == PackageManager.PERMISSION_GRANTED

    /** Lit les appels survenus depuis [sinceEpochMs]. */
    fun collect(sinceEpochMs: Long): List<CallRow> {
        if (!isEnabledAndGranted()) return emptyList()
        val rows = mutableListOf<CallRow>()
        // CONFORMITÉ (ligne rouge) : on ne lit PAS CACHED_NAME (nom du contact en
        // clair). Seuls le numéro — immédiatement haché — le sens, la durée et la
        // date sont collectés.
        val projection = arrayOf(
            CallLog.Calls.NUMBER, CallLog.Calls.NUMBER_PRESENTATION, CallLog.Calls.TYPE,
            CallLog.Calls.DATE, CallLog.Calls.DURATION,
        )
        val cursor = context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            projection,
            "${CallLog.Calls.DATE} > ?",
            arrayOf(sinceEpochMs.toString()),
            "${CallLog.Calls.DATE} ASC",
        ) ?: return emptyList()

        cursor.use { c ->
            val iNum = c.getColumnIndex(CallLog.Calls.NUMBER)
            val iPres = c.getColumnIndex(CallLog.Calls.NUMBER_PRESENTATION)
            val iType = c.getColumnIndex(CallLog.Calls.TYPE)
            val iDate = c.getColumnIndex(CallLog.Calls.DATE)
            val iDur = c.getColumnIndex(CallLog.Calls.DURATION)
            while (c.moveToNext()) {
                val number = if (iNum >= 0) c.getString(iNum) else null
                // Lue localement pour reconnaître un appel masqué ; jamais envoyée.
                val presentation = if (iPres >= 0) c.getInt(iPres) else CounterpartyHash.PRESENTATION_NOT_READ
                val type = if (iType >= 0) c.getInt(iType) else 0
                val date = if (iDate >= 0) c.getLong(iDate) else continue
                val durationS = if (iDur >= 0) c.getLong(iDur) else 0
                rows += CallRow(
                    direction = directionOf(type),
                    // Appel anonyme (absent, vide, privé, masqué) → null : la console
                    // affiche « Numéro masqué », sans faux correspondant commun.
                    // IDEMPOTENCE : la contrainte comm_events_dedup_key est NULLS NOT
                    // DISTINCT (migration 0029), donc le rejeu d'un appel anonyme ne
                    // crée pas de doublon.
                    counterpartyHash = CounterpartyHash.of(number, presentation, Config.commHashPepper),
                    durationMs = durationS * 1000,
                    occurredAt = date,
                )
            }
        }
        return rows
    }

    private fun directionOf(type: Int): String = when (type) {
        CallLog.Calls.INCOMING_TYPE -> "incoming"
        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
        CallLog.Calls.MISSED_TYPE -> "missed"
        CallLog.Calls.REJECTED_TYPE -> "rejected"
        CallLog.Calls.BLOCKED_TYPE -> "blocked"
        else -> "incoming"
    }
}
