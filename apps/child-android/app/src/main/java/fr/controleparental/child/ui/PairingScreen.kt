package fr.controleparental.child.ui

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import fr.controleparental.child.R
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.pairing.PairingCode
import fr.controleparental.child.pairing.PairingMessage
import fr.controleparental.child.pairing.PairingMessages
import fr.controleparental.child.pairing.PairingProtocol
import kotlinx.coroutines.delay

/**
 * Écran d'appairage (LOT 12, docs/14-APPAIRAGE.md §1) : code de 10 caractères
 * Crockford, normalisé à la frappe (majuscules, O→0, I/L→1, espaces et tirets
 * ignorés, U refusé), affiché `XXXXX-XXXXX`, collage tolérant.
 *
 * [notice] : raison d'un désenrôlement subi (session perdue, appareil retiré),
 * affichée en tête jusqu'au prochain essai. Le passage à « mes données » après
 * succès est piloté par MainActivity (SupervisionStore.current).
 */
@Composable
fun PairingScreen(
    store: SupervisionStore,
    notice: SupervisionStore.UnenrollReason?,
) {
    // Champ conservé à la rotation / recréation de l'activité.
    var field by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue("")) }
    var rejectedChar by rememberSaveable { mutableStateOf(false) }
    // Appel en cours / dernière erreur : niveau processus (survit à la recréation).
    val pairing by PairingController.state.collectAsState()
    var blockedUntil by remember { mutableLongStateOf(store.pairingBlockedUntil) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val context = LocalContext.current

    // Nouvelle erreur : relire le blocage ; après un code expiré/déjà utilisé,
    // tout sélectionner pour que le collage du nouveau code remplace l'ancien.
    LaunchedEffect(pairing.errorSeq) {
        blockedUntil = store.pairingBlockedUntil
        now = System.currentTimeMillis()
        if (pairing.errorCode == "code_expired" || pairing.errorCode == "code_already_used") {
            field = field.copy(selection = TextRange(0, field.text.length))
        }
    }

    // Compte à rebours `too_many_attempts` : Valider reste désactivé jusqu'au terme.
    val blocked = blockedUntil > now
    LaunchedEffect(blockedUntil) {
        while (blockedUntil > System.currentTimeMillis()) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
        now = System.currentTimeMillis()
    }

    val busy = pairing.busy
    val code = field.text
    val canSubmit = PairingCode.isValid(code) && !busy && !blocked

    fun submit() {
        if (!canSubmit) return
        store.acknowledgeUnenrolled()
        PairingController.submit(context, store, code)
    }

    val errorCode = pairing.errorCode
    val shownError = when {
        blocked -> errorMessage(
            context, "too_many_attempts", ((blockedUntil - now + 999) / 1000).toInt(),
        )
        busy -> null
        errorCode != null && errorCode != "too_many_attempts" -> errorMessage(context, errorCode, null)
        else -> null
    }
    // Annonce des erreurs par TalkBack sans voler le focus.
    val announce = Modifier.semantics { liveRegion = LiveRegionMode.Polite }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        notice?.let {
            Text(
                stringResource(
                    when (it) {
                        SupervisionStore.UnenrollReason.SESSION_LOST -> R.string.pairing_session_expired
                        SupervisionStore.UnenrollReason.DEVICE_REVOKED -> R.string.pairing_device_revoked
                    },
                ),
                modifier = announce,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(16.dp))
        }
        Text(stringResource(R.string.pairing_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.pairing_intro),
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = field,
            onValueChange = { input ->
                // Sélection conservée ; un code valide collé remplace tout le champ.
                val edit = PairingCode.applyEdit(
                    field.text, field.selection.min, field.selection.max,
                    input.text, input.selection.min, input.selection.max,
                )
                rejectedChar = edit.rejected
                field = TextFieldValue(edit.code, TextRange(edit.selStart, edit.selEnd))
            },
            label = { Text(stringResource(R.string.pairing_code_label)) },
            supportingText = {
                if (rejectedChar) {
                    Text(stringResource(R.string.pairing_code_rejected_char), modifier = announce)
                } else {
                    Text(stringResource(R.string.pairing_code_hint))
                }
            },
            isError = rejectedChar || shownError != null,
            singleLine = true,
            enabled = !busy,
            visualTransformation = GroupedCodeTransformation,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Ascii,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { submit() }),
        )
        Spacer(Modifier.height(16.dp))
        Button(enabled = canSubmit, onClick = { submit() }) {
            Text(stringResource(if (busy) R.string.pairing_submitting else R.string.pairing_submit))
        }

        shownError?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, modifier = announce, color = MaterialTheme.colorScheme.error)
        }

        Spacer(Modifier.height(32.dp))
        Text(
            stringResource(R.string.pairing_transparency),
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

/** Affichage groupé `XXXXX-XXXXX` : tiret après le 5e caractère (non saisi). */
private object GroupedCodeTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val raw = text.text
        val mapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int) = PairingCode.originalToGrouped(offset, raw.length)
            override fun transformedToOriginal(offset: Int) = PairingCode.groupedToOriginal(offset, raw.length)
        }
        return TransformedText(AnnotatedString(PairingCode.grouped(raw)), mapping)
    }
}

/** Code d'erreur (contrat §2–§5) → libellé français de strings.xml. */
private fun errorMessage(context: Context, code: String, retryAfterSeconds: Int?): String =
    when (PairingMessages.forCode(code)) {
        PairingMessage.INVALID_FORMAT -> context.getString(R.string.pairing_error_invalid_format)
        PairingMessage.NOT_FOUND -> context.getString(R.string.pairing_error_not_found)
        PairingMessage.ALREADY_USED -> context.getString(R.string.pairing_error_already_used)
        PairingMessage.EXPIRED -> context.getString(R.string.pairing_error_expired)
        PairingMessage.TOO_MANY_ATTEMPTS -> context.getString(
            R.string.pairing_error_too_many_attempts,
            PairingProtocol.retryMinutes(retryAfterSeconds ?: 60),
        )
        PairingMessage.INVALID_DEVICE -> context.getString(R.string.pairing_error_invalid_device)
        PairingMessage.DEVICE_MUST_REPAIR -> context.getString(R.string.pairing_error_device_must_repair)
        PairingMessage.CONNECTION_PROBLEM -> context.getString(R.string.pairing_error_connection_problem)
        PairingMessage.UNAVAILABLE -> context.getString(R.string.pairing_error_unavailable)
        PairingMessage.PAIRING_DISABLED -> context.getString(R.string.pairing_error_disabled)
        PairingMessage.NETWORK_RATE_LIMITED -> context.getString(R.string.pairing_error_network_rate_limited)
        PairingMessage.SESSION_EXPIRED -> context.getString(R.string.pairing_session_expired)
        PairingMessage.DEVICE_REVOKED -> context.getString(R.string.pairing_device_revoked)
        PairingMessage.GENERIC -> context.getString(R.string.pairing_error_generic, code)
    }
