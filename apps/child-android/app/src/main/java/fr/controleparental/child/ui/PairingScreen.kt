package fr.controleparental.child.ui

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
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
import fr.controleparental.child.data.PairingClient
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.pairing.PairingCode
import fr.controleparental.child.pairing.PairingMessage
import fr.controleparental.child.pairing.PairingMessages
import fr.controleparental.child.pairing.PairingProtocol
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Écran d'appairage (LOT 12, docs/14-APPAIRAGE.md §1) : code de 10 caractères
 * Crockford, normalisé à la frappe (majuscules, O→0, I/L→1, espaces et tirets
 * ignorés, U refusé), affiché `XXXXX-XXXXX`, collage tolérant.
 *
 * [notice] : raison d'un désenrôlement subi (session perdue, appareil retiré),
 * affichée en tête jusqu'au prochain essai.
 */
@Composable
fun PairingScreen(
    store: SupervisionStore,
    notice: SupervisionStore.UnenrollReason?,
    onEnrolled: () -> Unit,
) {
    var field by remember { mutableStateOf(TextFieldValue("")) }
    var rejectedChar by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var errorCode by remember { mutableStateOf<String?>(null) }
    var blockedUntil by remember { mutableLongStateOf(store.pairingBlockedUntil) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val client = remember { PairingClient(store) }

    // Compte à rebours `too_many_attempts` : Valider reste désactivé jusqu'au terme.
    val blocked = blockedUntil > now
    LaunchedEffect(blockedUntil) {
        while (blockedUntil > System.currentTimeMillis()) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
        now = System.currentTimeMillis()
    }

    val code = field.text
    val canSubmit = PairingCode.isValid(code) && !busy && !blocked

    fun submit() {
        if (!canSubmit) return
        busy = true; errorCode = null
        SupervisionStore.acknowledgeUnenrolled()
        scope.launch {
            when (val r = client.complete(code)) {
                is PairingClient.Result.Ok -> onEnrolled()
                is PairingClient.Result.Error -> {
                    errorCode = r.code
                    blockedUntil = store.pairingBlockedUntil
                    now = System.currentTimeMillis()
                }
            }
            busy = false
        }
    }

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
                val sanitized = PairingCode.sanitizeInput(input.text)
                // Curseur : même nombre de caractères significatifs qu'avant lui.
                val cursor = PairingCode.sanitizeInput(input.text.take(input.selection.end)).code.length
                    .coerceAtMost(sanitized.code.length)
                rejectedChar = sanitized.rejected
                field = TextFieldValue(sanitized.code, TextRange(cursor))
            },
            label = { Text(stringResource(R.string.pairing_code_label)) },
            supportingText = {
                Text(
                    stringResource(
                        if (rejectedChar) R.string.pairing_code_rejected_char else R.string.pairing_code_hint,
                    ),
                )
            },
            isError = rejectedChar,
            singleLine = true,
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

        val shownError = when {
            blocked -> errorMessage(
                context, "too_many_attempts", ((blockedUntil - now + 999) / 1000).toInt(),
            )
            errorCode != null && errorCode != "too_many_attempts" -> errorMessage(context, errorCode!!, null)
            else -> null
        }
        shownError?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
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
