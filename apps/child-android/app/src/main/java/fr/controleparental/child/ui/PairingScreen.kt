package fr.controleparental.child.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import android.content.Context
import fr.controleparental.child.R
import fr.controleparental.child.data.PairingClient
import fr.controleparental.child.data.SupervisionStore
import kotlinx.coroutines.launch

@Composable
fun PairingScreen(
    store: SupervisionStore,
    onEnrolled: () -> Unit,
) {
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val client = remember { PairingClient() }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(stringResource(R.string.pairing_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.pairing_intro),
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = code,
            onValueChange = { if (it.length <= 8 && it.all(Char::isDigit)) code = it },
            label = { Text(stringResource(R.string.pairing_code_label)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        Spacer(Modifier.height(16.dp))
        Button(
            enabled = code.length == 8 && !busy,
            onClick = {
                busy = true; error = null
                scope.launch {
                    when (val r = client.complete(code)) {
                        is PairingClient.Result.Ok -> {
                            store.save(r.enrollment)
                            onEnrolled()
                        }
                        is PairingClient.Result.Error -> error = mapError(context, r.code)
                    }
                    busy = false
                }
            },
        ) { Text(stringResource(if (busy) R.string.pairing_submitting else R.string.pairing_submit)) }

        error?.let {
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

private fun mapError(context: Context, code: String): String = when (code) {
    "invalid_code_format" -> context.getString(R.string.pairing_error_invalid_format)
    "code_not_found" -> context.getString(R.string.pairing_error_not_found)
    "code_already_used" -> context.getString(R.string.pairing_error_already_used)
    "code_expired" -> context.getString(R.string.pairing_error_expired)
    else -> context.getString(R.string.pairing_error_generic, code)
}
