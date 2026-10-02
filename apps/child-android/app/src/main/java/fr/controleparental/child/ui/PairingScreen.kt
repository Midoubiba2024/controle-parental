package fr.controleparental.child.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
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
    val client = remember { PairingClient() }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Associer cet appareil", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            "Saisis le code à 8 chiffres affiché par tes parents dans leur application.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = code,
            onValueChange = { if (it.length <= 8 && it.all(Char::isDigit)) code = it },
            label = { Text("Code d'appairage") },
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
                        is PairingClient.Result.Error -> error = mapError(r.code)
                    }
                    busy = false
                }
            },
        ) { Text(if (busy) "Association…" else "Associer") }

        error?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }

        Spacer(Modifier.height(32.dp))
        Text(
            "Cette application est visible et t'informera toujours de ce qui est partagé " +
                "avec tes parents. Rien n'est caché.",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

private fun mapError(code: String): String = when (code) {
    "invalid_code_format" -> "Le code doit comporter 8 chiffres."
    "code_not_found" -> "Code introuvable. Vérifie la saisie."
    "code_already_used" -> "Ce code a déjà été utilisé."
    "code_expired" -> "Ce code a expiré. Demande-en un nouveau."
    else -> "Échec de l'association ($code)."
}
