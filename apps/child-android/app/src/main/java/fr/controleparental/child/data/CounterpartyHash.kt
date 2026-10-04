package fr.controleparental.child.data

import android.provider.CallLog
import java.security.MessageDigest
import java.util.Locale

/**
 * Numéro du correspondant → clé de regroupement hachée, ou null si l'appel est
 * ANONYME. Fonction PURE (testable en JVM, aucun accès au système).
 *
 * Un appel est anonyme quand le numéro est absent ou vide, quand Android signale
 * une présentation autre que « autorisée » (CallLog.Calls.PRESENTATION_RESTRICTED,
 * _UNKNOWN, _PAYPHONE, _UNAVAILABLE), ou quand le numéro est un ancien marqueur
 * de numéro privé ou inconnu (« -1 », « -2 », « -3 », encore écrit par certains
 * constructeurs). Dans ces cas, on renvoie null : aucun hash commun ne doit faire
 * croire au parent que tous les appels masqués viennent du même correspondant. La
 * console affiche alors « Numéro masqué ».
 *
 * ATTENTION : le hachage est LOCAL et son poivre est compilé dans l'APK, donc
 * réversible par force brute (cf. Config.commHashPepper). C'est une clé de
 * regroupement, pas un anonymat.
 */
object CounterpartyHash {

    /** Présentation inconnue (colonne absente du curseur) : on juge sur le numéro seul. */
    const val PRESENTATION_NOT_READ = -1

    private val LEGACY_ANONYMOUS_MARKERS = setOf("-1", "-2", "-3")

    /** L'appel est-il anonyme (numéro absent, vide, privé ou masqué) ? */
    fun isAnonymous(number: String?, presentation: Int = PRESENTATION_NOT_READ): Boolean {
        if (presentation != PRESENTATION_NOT_READ && presentation != CallLog.Calls.PRESENTATION_ALLOWED) return true
        val n = number?.trim()
        return n.isNullOrEmpty() || n in LEGACY_ANONYMOUS_MARKERS
    }

    /** Hash SHA-256 poivré du numéro, ou null si l'appel est anonyme. */
    fun of(number: String?, presentation: Int, pepper: String): String? =
        if (isAnonymous(number, presentation)) null else sha256("$pepper:${number!!.trim()}")

    /** Hash d'une valeur brute (même format que [of], pour un marqueur constant). */
    fun raw(value: String, pepper: String): String = sha256("$pepper:$value")

    private fun sha256(input: String): String =
        MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
            // Hachage machine : jamais localisé.
            .joinToString("") { String.format(Locale.ROOT, "%02x", it) }
}
