package fr.controleparental.child.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.core.content.ContextCompat
import fr.controleparental.child.Config
import java.security.MessageDigest

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
            CallLog.Calls.NUMBER, CallLog.Calls.TYPE,
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
            val iType = c.getColumnIndex(CallLog.Calls.TYPE)
            val iDate = c.getColumnIndex(CallLog.Calls.DATE)
            val iDur = c.getColumnIndex(CallLog.Calls.DURATION)
            while (c.moveToNext()) {
                val number = if (iNum >= 0) c.getString(iNum) else null
                val type = if (iType >= 0) c.getInt(iType) else 0
                val date = if (iDate >= 0) c.getLong(iDate) else continue
                val durationS = if (iDur >= 0) c.getLong(iDur) else 0
                rows += CallRow(
                    direction = directionOf(type),
                    // IDEMPOTENCE : jamais null. Un numéro absent/masqué donne un
                    // hash SENTINELLE stable, pour que la contrainte d'unicité
                    // (device_id, occurred_at, counterparty_hash, direction) matche
                    // au rejeu (sinon NULLS DISTINCT ⇒ doublons). Le sentinel est une
                    // constante : il n'expose aucun numéro.
                    counterpartyHash = number?.takeIf { it.isNotBlank() }?.let { hash(it) }
                        ?: hash(NO_NUMBER_SENTINEL),
                    durationMs = durationS * 1000,
                    occurredAt = date,
                )
            }
        }
        return rows
    }

    private companion object {
        // Marqueur stable pour « numéro absent/inconnu » (appels masqués, privés).
        const val NO_NUMBER_SENTINEL = "__no_number__"
    }

    private fun directionOf(type: Int): String = when (type) {
        CallLog.Calls.INCOMING_TYPE -> "incoming"
        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
        CallLog.Calls.MISSED_TYPE -> "missed"
        CallLog.Calls.REJECTED_TYPE -> "rejected"
        CallLog.Calls.BLOCKED_TYPE -> "blocked"
        else -> "incoming"
    }

    // NB : hachage LOCAL — poivre présent dans l'APK, donc réversible (numéros à
    // faible entropie). Clé de regroupement uniquement, pas un anonymat. À déplacer
    // côté serveur (HMAC) avant activation en release (cf. Config.commHashPepper).
    private fun hash(number: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest("${Config.commHashPepper}:${number.trim()}".toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
