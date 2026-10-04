package fr.controleparental.child.pairing

/**
 * Code d'appairage (LOT 12) : 10 caractères de l'alphabet base32 de Crockford
 * (chiffres + lettres sans I, L, O, U), affiché par la console en deux groupes
 * de 5 (`7KQ2M-X9D4F`). Contrat : docs/14-APPAIRAGE.md §1.
 *
 * Logique PURE (sans Android) : testée en JVM. Le serveur
 * (`app.pairing_code_normalize` + contrôle du format) reste l'arbitre ; ce qui
 * suit n'est qu'un confort de saisie aligné sur ses règles.
 *
 * 🔴 Ne jamais journaliser un code (Logcat, rapports de plantage).
 */
object PairingCode {

    const val LENGTH = 10
    const val GROUP = 5

    /** Alphabet Crockford (ordre indifférent). */
    private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

    /** U+FEFF comparé par son code : jamais de BOM littéral dans la source (lint ByteOrderMark). */
    private const val BOM = 0xFEFF

    /** Format attendu APRÈS normalisation (identique au serveur). */
    private val VALID = Regex("^[0-9A-HJKMNP-TV-Z]{10}$")

    /**
     * Séparateurs ignorés, comme côté serveur : espaces (dont insécables et de
     * largeur nulle, fréquents au copier-coller) et tirets (dont Unicode).
     */
    private fun isSeparator(c: Char): Boolean =
        c.isWhitespace() ||
            c == '\u00A0' || c == '\u2007' || c == '\u202F' ||
            c in '\u200B'..'\u200D' || c == '\u2060' || c.code == BOM ||
            c == '-' || c in '\u2010'..'\u2015' || c == '\u2212' ||
            c == '\uFE58' || c == '\uFE63' || c == '\uFF0D'

    /** Majuscule ASCII puis équivalences Crockford O→0, I→1, L→1. */
    private fun canonical(c: Char): Char = when (val u = if (c in 'a'..'z') c - 32 else c) {
        'O' -> '0'
        'I', 'L' -> '1'
        else -> u
    }

    /**
     * Normalisation IDENTIQUE au serveur (`app.pairing_code_normalize`) : retrait
     * des séparateurs, majuscules, O→0, I/L→1. Ne valide pas (voir [isValid]).
     */
    fun normalize(raw: String): String = buildString(raw.length) {
        for (c in raw) if (!isSeparator(c)) append(canonical(c))
    }

    /** true si [raw], une fois normalisé, est un code Crockford de 10 caractères. */
    fun isValid(raw: String): Boolean = VALID.matches(normalize(raw))

    /**
     * Résultat d'une frappe : [code] = forme normalisée (≤ 10 caractères
     * significatifs, alphabet Crockford uniquement) ; [rejected] = au moins un
     * caractère refusé (un `U`, ou tout caractère hors alphabet).
     */
    data class Input(val code: String, val rejected: Boolean)

    /**
     * Filtre de saisie (frappe ou collage) : ignore espaces et tirets, passe en
     * majuscules, applique O→0 / I→1 / L→1, refuse `U` et tout autre caractère,
     * borne à 10 caractères significatifs. `7KQ2M-X9D4F` et `7kq2m x9d4f`
     * donnent tous deux `7KQ2MX9D4F`.
     */
    fun sanitizeInput(raw: String): Input {
        var rejected = false
        val code = buildString(LENGTH) {
            for (c in raw) {
                if (isSeparator(c)) continue
                val k = canonical(c)
                if (ALPHABET.indexOf(k) < 0) { rejected = true; continue }
                if (length < LENGTH) append(k)
            }
        }
        return Input(code, rejected)
    }

    /** Forme affichée : tiret après le 5e caractère (`7KQ2M-X9D4F`). */
    fun grouped(code: String): String =
        if (code.length <= GROUP) code else code.substring(0, GROUP) + "-" + code.substring(GROUP)

    /** Position du curseur : forme brute → forme groupée (tiret inséré après 5). */
    fun originalToGrouped(offset: Int, length: Int): Int =
        if (offset > GROUP && length > GROUP) offset + 1 else offset

    /** Position du curseur : forme groupée → forme brute (bornée à [length]). */
    fun groupedToOriginal(offset: Int, length: Int): Int =
        (if (offset > GROUP && length > GROUP) offset - 1 else offset).coerceIn(0, length)
}
