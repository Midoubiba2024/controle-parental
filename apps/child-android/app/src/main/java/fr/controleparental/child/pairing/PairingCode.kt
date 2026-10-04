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

    /**
     * Majuscule (Unicode, comme `upper()` côté SQL : `ı` → `I`, `ſ` → `S`) puis
     * équivalences Crockford O→0, I→1, L→1.
     */
    private fun canonical(c: Char): Char = when (val u = c.uppercaseChar()) {
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

    /**
     * Résultat d'une modification du champ : texte normalisé + sélection.
     * [pasteRejected] : un collage qui n'est pas un code seul (message entier,
     * texte trop long) a été refusé — l'appli affiche « colle uniquement le code ».
     */
    data class Edit(
        val code: String,
        val selStart: Int,
        val selEnd: Int,
        val rejected: Boolean,
        val pasteRejected: Boolean = false,
    )

    /**
     * Applique une modification du champ ([before] → [after], sélections comprises)
     * en conservant la sélection de l'utilisateur :
     *  - si le segment INSÉRÉ (collage) est à lui seul un code valide, il REMPLACE
     *    tout le champ (coller un nouveau code dans un champ déjà rempli) ;
     *  - sinon la saisie est filtrée ([sanitizeInput]) et la sélection recalculée
     *    sur le texte filtré ;
     *  - une frappe qui dépasserait 10 caractères est refusée (champ inchangé),
     *    comme une longueur maximale.
     * [before] est toujours une forme normalisée (≤ 10 caractères).
     */
    fun applyEdit(
        before: String, beforeSelStart: Int, beforeSelEnd: Int,
        after: String, afterSelStart: Int, afterSelEnd: Int,
    ): Edit {
        val inserted = insertedSegment(before, beforeSelStart, beforeSelEnd, after)
        if (inserted.length > 1 && after != before) {
            if (isValid(inserted)) {
                val code = normalize(inserted)
                return Edit(code, code.length, code.length, rejected = false)
            }
            // Collage d'autre chose qu'un code seul (« Ton code : 7KQ2M-X9D4F »,
            // texte trop long, caractères étrangers) : refusé tel quel, sans
            // extraction automatique, avec un message dédié.
            if (significantLength(inserted) > LENGTH || sanitizeInput(inserted).rejected) {
                return Edit(
                    before, beforeSelStart.coerceIn(0, before.length), beforeSelEnd.coerceIn(0, before.length),
                    rejected = false, pasteRejected = true,
                )
            }
        }

        val full = sanitizeInput(after)
        if (significantLength(after) > LENGTH) {
            // Débordement : on garde l'état précédent (pas de troncature silencieuse).
            return Edit(before, beforeSelStart.coerceIn(0, before.length),
                beforeSelEnd.coerceIn(0, before.length), rejected = full.rejected)
        }
        fun map(offset: Int) = sanitizeInput(after.take(offset.coerceIn(0, after.length))).code.length
            .coerceAtMost(full.code.length)
        return Edit(full.code, map(afterSelStart), map(afterSelEnd), full.rejected)
    }

    /**
     * Segment inséré par la modification. D'abord ANCRÉ sur la sélection d'avant
     * (le texte avant et après elle doit être inchangé) — cas normal d'une frappe
     * ou d'un collage ; sinon, repli sur préfixe/suffixe communs.
     */
    private fun insertedSegment(before: String, selStart: Int, selEnd: Int, after: String): String {
        val s = minOf(selStart, selEnd).coerceIn(0, before.length)
        val e = maxOf(selStart, selEnd).coerceIn(0, before.length)
        val head = before.substring(0, s)
        val tail = before.substring(e)
        if (after.length >= head.length + tail.length && after.startsWith(head) && after.endsWith(tail)) {
            return after.substring(head.length, after.length - tail.length)
        }
        var prefix = 0
        val maxPrefix = minOf(before.length, after.length)
        while (prefix < maxPrefix && before[prefix] == after[prefix]) prefix++
        var suffix = 0
        while (suffix < minOf(before.length, after.length) - prefix &&
            before[before.length - 1 - suffix] == after[after.length - 1 - suffix]
        ) suffix++
        return after.substring(prefix, after.length - suffix)
    }

    /** Nombre de caractères conservés par [sanitizeInput] avant la borne de 10. */
    private fun significantLength(raw: String): Int =
        raw.count { !isSeparator(it) && ALPHABET.indexOf(canonical(it)) >= 0 }

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
