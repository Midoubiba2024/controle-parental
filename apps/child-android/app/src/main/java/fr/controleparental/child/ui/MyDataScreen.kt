package fr.controleparental.child.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import fr.controleparental.child.data.SupervisionStore

/**
 * Écran de TRANSPARENCE côté enfant (« mes données »).
 * Brique de légalité : l'enfant voit que la supervision est active, ce qui est
 * (ou sera) partagé, et avec quel niveau. À enrichir avec le journal d'audit réel.
 */
@Composable
fun MyDataScreen(enrollment: SupervisionStore.Enrollment) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
    ) {
        Text("Supervision active", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            "Tes parents t'accompagnent via cette application. Elle reste visible et " +
                "tu peux voir ici ce qui est partagé.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(24.dp))

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Niveau de supervision", style = MaterialTheme.typography.labelMedium)
                Text(
                    if (enrollment.mode == "reinforced") "Renforcé" else "Standard",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }
        Spacer(Modifier.height(16.dp))

        Text("Ce qui est partagé pour l'instant", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        listOf(
            "Le fait que cet appareil est associé à ta famille.",
            "L'état de supervision (cette notification).",
        ).forEach {
            Text("•  $it", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(4.dp))
        }

        Spacer(Modifier.height(16.dp))
        Text(
            "Les fonctions de suivi (temps d'écran, localisation, filtrage…) seront ajoutées " +
                "progressivement et affichées ici, en clair, avant d'être activées.",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
