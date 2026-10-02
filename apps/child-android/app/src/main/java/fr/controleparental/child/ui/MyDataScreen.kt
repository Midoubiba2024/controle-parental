package fr.controleparental.child.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import android.net.Uri
import android.os.Build
import fr.controleparental.child.Config
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.data.UsageStatsCollector
import fr.controleparental.child.enforce.BlockOverlay
import fr.controleparental.child.enforce.PolicyCache
import fr.controleparental.child.enforce.PolicyClient
import fr.controleparental.child.enforce.RuleSet
import org.json.JSONObject

/**
 * Écran de TRANSPARENCE côté enfant (« mes données »).
 *
 * Brique de légalité (RGPD art. 12-13, CNIL) : l'enfant voit, en langage clair,
 * que la supervision est active, EXACTEMENT ce qui est partagé (métadonnées /
 * agrégats, jamais le contenu), et peut activer lui-même les accès nécessaires.
 */
@Composable
fun MyDataScreen(enrollment: SupervisionStore.Enrollment) {
    val context = LocalContext.current
    val usage = remember { UsageStatsCollector(context) }
    var usageGranted by remember { mutableStateOf(usage.hasUsageAccess()) }

    // Re-vérifie l'accès à l'usage au retour des réglages.
    val usageSettings = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { usageGranted = usage.hasUsageAccess() }

    val overlay = remember { BlockOverlay(context) }
    var overlayGranted by remember { mutableStateOf(overlay.canDraw()) }
    val overlaySettings = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { overlayGranted = overlay.canDraw() }

    // Règles actives (lues depuis le cache chiffré, synchronisé par le service).
    val rules = remember {
        val json = PolicyCache(context).rulesJson
        if (json != null) runCatching { PolicyClient.parseRuleSet(JSONObject(json)) }.getOrNull() else null
    }

    var callLogGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG)
                == PackageManager.PERMISSION_GRANTED,
        )
    }
    val callLogPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { callLogGranted = it }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
    ) {
        Text("Mes données", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            "Tes parents t'accompagnent via cette application. Elle reste visible : " +
                "tu peux voir ici tout ce qui est partagé. Rien n'est caché, et jamais " +
                "le contenu de tes messages, appels ou de ce que tu regardes.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(20.dp))

        InfoCard("Niveau de supervision") {
            Text(
                if (enrollment.mode == "reinforced") "Renforcé" else "Standard",
                style = MaterialTheme.typography.bodyLarge,
            )
        }
        Spacer(Modifier.height(16.dp))

        Text("Ce qui est partagé avec tes parents", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        listOf(
            "Le temps que tu passes sur chaque application (durées seulement).",
            "La liste des applications installées sur l'appareil.",
            "Le niveau de batterie et l'espace de stockage de l'appareil.",
            if (Config.featureCallLog)
                "Le journal des appels en métadonnées : qui (sans le numéro en clair), " +
                    "quand et combien de temps — jamais ce qui a été dit."
            else null,
        ).filterNotNull().forEach {
            Text("•  $it", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(6.dp))
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "Jamais partagé : le contenu de tes messages et appels, tes mots de passe, " +
                "ni l'image de ton écran, de ta caméra ou de ton micro.",
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(20.dp))

        Text("Mes règles en ce moment", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        val ruleLines = summarizeRules(rules)
        InfoCard("Règles d'accès définies par mes parents") {
            if (ruleLines.isEmpty()) {
                Text("Aucune règle particulière pour l'instant.", style = MaterialTheme.typography.bodyMedium)
            } else {
                ruleLines.forEach {
                    Text("•  $it", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            "Tu peux demander plus de temps directement sur l'écran de pause. " +
                "Les appels d'urgence (112) restent toujours possibles.",
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(20.dp))

        Text("Autorisations", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))

        PermissionCard(
            title = "Accès au temps d'écran",
            granted = usageGranted,
            explanation = "Permet de calculer le temps passé par application. " +
                "À activer dans les réglages du téléphone.",
            actionLabel = if (usageGranted) "Activé" else "Activer dans les réglages",
            onAction = { usageSettings.launch(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) },
        )

        Spacer(Modifier.height(12.dp))
        PermissionCard(
            title = "Affichage de l'écran de pause",
            granted = overlayGranted,
            explanation = "Permet d'afficher l'écran de pause quand une limite est atteinte. " +
                "Sans cette autorisation, la pause s'affiche moins bien.",
            actionLabel = if (overlayGranted) "Activé" else "Activer dans les réglages",
            onAction = {
                val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.packageName))
                } else {
                    Intent(Settings.ACTION_SETTINGS)
                }
                overlaySettings.launch(intent)
            },
        )

        if (Config.featureCallLog) {
            Spacer(Modifier.height(12.dp))
            PermissionCard(
                title = "Journal d'appels (métadonnées)",
                granted = callLogGranted,
                explanation = "Partage qui/quand/durée des appels — jamais le contenu. " +
                    "Tu peux refuser : cette fonction est facultative.",
                actionLabel = if (callLogGranted) "Activé" else "Autoriser",
                onAction = { callLogPermission.launch(Manifest.permission.READ_CALL_LOG) },
            )
        }

        Spacer(Modifier.height(20.dp))
        Text(
            "Tu peux à tout moment demander à tes parents de voir ce qui est enregistré, " +
                "de le corriger ou de l'effacer.",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

/** Résume le jeu de règles en phrases claires et non culpabilisantes (K2). */
private fun summarizeRules(rules: RuleSet?): List<String> {
    if (rules == null) return emptyList()
    val lines = mutableListOf<String>()
    val p = rules.policy

    p?.dailyLimitMinutes?.let { lines += "Temps d'écran : $it min par jour (hors bonus)." }
    if (rules.weekdayLimits.isNotEmpty()) lines += "Des limites différentes selon les jours de la semaine."

    val blocked = rules.appRules.count { it.action == "block" }
    val limited = rules.appRules.count { it.action == "limit" }
    val always = rules.appRules.count { it.action == "always_allow" }
    if (blocked > 0) lines += "$blocked élément(s) mis en pause (apps ou catégories)."
    if (limited > 0) lines += "$limited élément(s) avec un temps limité par jour."
    if (always > 0) lines += "$always application(s) toujours autorisées (dont l'essentiel)."

    val kinds = rules.schedules.map { it.kind }.toSet()
    if ("downtime" in kinds) lines += "Une heure du coucher (pause le soir)."
    if ("blocked" in kinds) lines += "Des créneaux réservés (devoirs, repas…)."
    if ("allowed" in kinds) lines += "Des plages d'utilisation autorisées."
    if ("school" in kinds) lines += "Un mode École (seules les apps pour apprendre)."

    if (p?.vacationFrom != null && p.vacationUntil != null)
        lines += "Un mode vacances est programmé (du ${p.vacationFrom} au ${p.vacationUntil})."
    if (p?.blockNewApps == true) lines += "Les nouvelles applications attendent l'accord de tes parents."
    if (p?.lockSystemSettings == true) lines += "Certains réglages du téléphone sont verrouillés."

    return lines
}

@Composable
private fun InfoCard(label: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium)
            content()
        }
    }
}

@Composable
private fun PermissionCard(
    title: String,
    granted: Boolean,
    explanation: String,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                AssistChip(
                    onClick = {},
                    enabled = false,
                    label = { Text(if (granted) "✓ accordé" else "non accordé") },
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(explanation, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(10.dp))
            Button(onClick = onAction, enabled = !granted) { Text(actionLabel) }
        }
    }
}
