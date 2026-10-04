package fr.controleparental.child.ui

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.VpnService
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import android.net.Uri
import android.content.res.Resources
import android.os.Build
import fr.controleparental.child.Config
import fr.controleparental.child.R
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.data.UsageStatsCollector
import fr.controleparental.child.enforce.BlockOverlay
import fr.controleparental.child.enforce.PolicyCache
import fr.controleparental.child.enforce.PolicyClient
import fr.controleparental.child.enforce.RuleSet
import fr.controleparental.child.filter.FilterCache
import fr.controleparental.child.filter.FilterClient
import fr.controleparental.child.filter.LocalDnsVpnService
import fr.controleparental.child.location.GeofenceManager
import fr.controleparental.child.location.LocationClient
import fr.controleparental.child.location.LocationCoordinator
import fr.controleparental.child.location.LocationRepository
import fr.controleparental.child.safety.SafetyCache
import fr.controleparental.child.safety.SafetyClient
import fr.controleparental.child.safety.SafetyNotificationListener
import fr.controleparental.child.service.SupervisionService
import kotlinx.coroutines.launch
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

    // --- LOT 3 — Localisation & SOS ------------------------------------------
    val scope = rememberCoroutineScope()
    val store = remember { SupervisionStore(context) }
    val locationRepo = remember { LocationRepository(store) }
    val locationClient = remember { LocationClient(context) }

    var fineGranted by remember { mutableStateOf(locationClient.hasFine()) }
    // targetSdk ≥ 31 : FINE doit être demandée AVEC COARSE, sinon Android n'affiche
    // pas la fenêtre. L'enfant peut n'accorder que « approximative ».
    val finePermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        fineGranted = locationClient.hasFine()
        // Relance le service pour activer le type de premier plan `location`
        // (nécessite la permission au démarrage sur Android 14).
        if (fineGranted) SupervisionService.start(context)
    }

    var bgGranted by remember { mutableStateOf(locationClient.hasBackground()) }
    val bgPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { bgGranted = locationClient.hasBackground() }

    // Réglage de partage actuel (affiché à l'enfant — transparence). Hors ligne,
    // settings() renvoie le défaut (check-in seulement).
    var locSettings by remember { mutableStateOf<LocationRepository.Settings?>(null) }
    LaunchedEffect(Unit) {
        locSettings = runCatching { locationRepo.settings() }.getOrNull()
    }

    // Zones (geofences) : actives si la position précise est accordée ET si les
    // alertes de zones sont activées, QUEL QUE SOIT le mode de partage de position.
    // On annonce la ligne s'il existe au moins une zone,
    // d'après le cache local (hors ligne) OU la base (zones pas encore synchronisées).
    val geofenceManager = remember { GeofenceManager(context) }
    var zoneCount by remember { mutableStateOf(geofenceManager.registeredZoneCount()) }
    LaunchedEffect(Unit) {
        val remote = runCatching { locationRepo.geofences().size }.getOrDefault(0)
        zoneCount = maxOf(zoneCount, remote)
    }

    // --- LOT 5 — Messages des parents (repli consultable, cf. revue #2) -------
    // Si les notifications sont coupées, le service ne notifie pas ; l'enfant
    // retrouve ici les messages. L'ouverture de l'écran POSE l'accusé de lecture
    // et avance le filigrane (seulement si le PATCH read_at réussit).
    val messageClient = remember { PolicyClient(store) }
    var parentMessages by remember { mutableStateOf<List<PolicyClient.MessageRow>>(emptyList()) }
    LaunchedEffect(Unit) {
        runCatching {
            val msgs = messageClient.newParentMessages(null)
            parentMessages = msgs
            if (msgs.isNotEmpty() && messageClient.markMessagesRead(msgs.map { it.id })) {
                store.messageWatermark = msgs.last().createdAt
            }
        }
    }

    // --- LOT 4 — Filtrage du web (VpnService local) --------------------------
    val filterCache = remember { FilterCache(context) }
    val filterConfig = remember { FilterClient(store).fromCache(filterCache) }
    // État initial = état réel du tunnel (plus de « false » figé à chaque ouverture).
    var filterOn by remember { mutableStateOf(LocalDnsVpnService.isRunning) }
    val vpnConsent = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            LocalDnsVpnService.start(context); filterOn = true
        }
    }
    fun enableFilter() {
        // VpnService.prepare : demande le consentement (toujours visible) ou null
        // si déjà accordé. Gère proprement l'absence de permission (pas de crash).
        val intent = runCatching { VpnService.prepare(context) }.getOrNull()
        if (intent != null) vpnConsent.launch(intent)
        else { LocalDnsVpnService.start(context); filterOn = true }
    }

    // --- LOT 6 — Analyse de bien-être/sécurité ON-DEVICE (profil ado) --------
    // Transparence (K2) : l'ado voit que le texte de ses notifications est analysé
    // SUR L'APPAREIL, que seule une ALERTE de catégorie remonte (jamais le texte),
    // et il peut désactiver (retirer l'accès) ou mettre une PAUSE (K8). Rien pour
    // young_child (gradation par âge) : la section n'apparaît pas.
    val safetyCache = remember { SafetyCache(context) }
    val safetyClient = remember { SafetyClient(store) }
    var listenerEnabled by remember { mutableStateOf(SafetyNotificationListener.isEnabled(context)) }
    var teenProfile by remember { mutableStateOf(safetyCache.teenProfile) }
    var analysisEnabled by remember { mutableStateOf(safetyCache.analysisEnabled) }
    var mutualVisibility by remember { mutableStateOf(safetyCache.mutualVisibility) }
    var pauseActive by remember { mutableStateOf(safetyCache.pauseActive) }
    var mySignals by remember { mutableStateOf<List<SafetyClient.MySignal>>(emptyList()) }
    var safetyBusy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (Config.featureSafetySignals) {
            safetyClient.syncSettings(safetyCache)
            teenProfile = safetyCache.teenProfile
            analysisEnabled = safetyCache.analysisEnabled
            mutualVisibility = safetyCache.mutualVisibility
            pauseActive = safetyCache.pauseActive
            // Visibilité mutuelle (K6) : l'ado voit SES propres signaux (métadonnées).
            if (safetyCache.teenProfile && safetyCache.mutualVisibility) {
                mySignals = safetyClient.fetchMySignals()
            }
        }
    }
    val listenerSettings = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        listenerEnabled = SafetyNotificationListener.isEnabled(context)
        // Rendre l'état visible au parent immédiatement (transparence).
        scope.launch { safetyClient.reportStatus(listenerEnabled && analysisEnabled && !pauseActive) }
    }
    val showSafety = Config.featureSafetySignals && teenProfile

    var sosBusy by remember { mutableStateOf(false) }
    var sosMsg by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
    ) {
        Text(stringResource(R.string.mydata_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.mydata_intro),
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(20.dp))

        // --- Bouton SOS (déclenché par l'enfant → transparent, E1/E2) --------
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.sos_title), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(4.dp))
                Text(
                    stringResource(R.string.sos_intro, Config.EMERGENCY_NUMBER),
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(10.dp))
                Button(
                    enabled = !sosBusy,
                    onClick = {
                        scope.launch {
                            sosBusy = true; sosMsg = null
                            val ok = locationRepo.startSos(null)
                            if (ok) {
                                val loc = locationClient.currentFix(highAccuracy = true)
                                if (loc != null) locationRepo.insertFix(loc, source = "sos", batteryLevel = null)
                            }
                            sosBusy = false
                            sosMsg = if (ok) context.getString(R.string.sos_sent)
                                     else context.getString(R.string.sos_failed, Config.EMERGENCY_NUMBER)
                        }
                    },
                ) { Text(stringResource(if (sosBusy) R.string.sos_sending else R.string.sos_button)) }
                sosMsg?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        InfoCard(stringResource(R.string.supervision_level_label)) {
            Text(
                stringResource(
                    if (enrollment.mode == "reinforced") R.string.supervision_level_reinforced
                    else R.string.supervision_level_standard,
                ),
                style = MaterialTheme.typography.bodyLarge,
            )
        }
        Spacer(Modifier.height(16.dp))

        Text(stringResource(R.string.shared_title), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        // Chaque donnée visible dans la console parent est annoncée ici, avec ses
        // conditions réelles (inventaire : PR LOT 10b). Rien n'est minimisé.
        val res = context.resources
        val loc = locSettings
        val locationOff = loc != null && (!loc.enabled || loc.mode == "off")
        val sosMinutes = (LocationCoordinator.MAX_SOS_LIVE_MS / 60_000L).toInt()
        listOfNotNull(
            stringResource(R.string.shared_usage),
            stringResource(R.string.shared_inventory),
            stringResource(R.string.shared_device),
            when {
                locationOff -> stringResource(R.string.shared_location_off)
                loc != null && loc.mode == "periodic" -> {
                    val minutes = LocationCoordinator.periodicIntervalMinutes(loc.periodicIntervalSec)
                    res.getQuantityString(R.plurals.shared_location_periodic, minutes, minutes)
                }
                else -> stringResource(R.string.shared_location_on_demand)
            },
            if (locationOff) null else stringResource(R.string.shared_location_details),
            res.getQuantityString(R.plurals.shared_sos, sosMinutes, sosMinutes),
            // Alertes de zones : réglage SÉPARÉ du partage de position.
            when {
                loc?.geofenceAlertsEnabled == false -> stringResource(R.string.shared_zones_disabled)
                zoneCount == 0 -> null
                locationOff -> stringResource(R.string.shared_zones_location_off)
                else -> stringResource(R.string.shared_zones)
            },
            when {
                !Config.featureCallLog -> null
                callLogGranted -> stringResource(R.string.shared_call_log)
                else -> stringResource(R.string.shared_call_log_pending)
            },
            if (Config.featureNetworkFilter) stringResource(R.string.shared_filter) else null,
            if (Config.featureNetworkFilter && filterConfig?.policy?.logAllowed == true)
                stringResource(R.string.shared_filter_log_allowed)
            else null,
            if (showSafety && analysisEnabled && listenerEnabled && !pauseActive)
                stringResource(R.string.shared_safety_active)
            else if (showSafety && analysisEnabled)
                stringResource(R.string.shared_safety_pending)
            else null,
            stringResource(R.string.shared_requests),
            stringResource(R.string.shared_messages),
        ).forEach {
            Text(stringResource(R.string.mydata_list_item, it), style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(6.dp))
        }
        Spacer(Modifier.height(4.dp))
        Text(
            stringResource(R.string.never_shared),
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(20.dp))

        Text(stringResource(R.string.rules_title), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        val ruleLines = summarizeRules(rules, context.resources)
        InfoCard(stringResource(R.string.rules_card_label)) {
            if (ruleLines.isEmpty()) {
                Text(stringResource(R.string.rules_none), style = MaterialTheme.typography.bodyMedium)
            } else {
                ruleLines.forEach {
                    Text(stringResource(R.string.mydata_list_item, it), style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            stringResource(R.string.rules_footer, Config.EMERGENCY_NUMBER),
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(20.dp))

        if (parentMessages.isNotEmpty()) {
            Text(stringResource(R.string.parent_messages_title), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            parentMessages.takeLast(20).forEach { m ->
                Card(Modifier.fillMaxWidth()) {
                    Text(m.body, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
                }
                Spacer(Modifier.height(8.dp))
            }
            Spacer(Modifier.height(12.dp))
        }

        Text(stringResource(R.string.permissions_title), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))

        PermissionCard(
            title = stringResource(R.string.permission_usage_title),
            granted = usageGranted,
            explanation = stringResource(R.string.permission_usage_explanation),
            actionLabel = stringResource(
                if (usageGranted) R.string.permission_enabled else R.string.permission_enable_in_settings,
            ),
            onAction = { usageSettings.launch(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) },
        )

        Spacer(Modifier.height(12.dp))
        PermissionCard(
            title = stringResource(R.string.permission_overlay_title),
            granted = overlayGranted,
            explanation = stringResource(R.string.permission_overlay_explanation),
            actionLabel = stringResource(
                if (overlayGranted) R.string.permission_enabled else R.string.permission_enable_in_settings,
            ),
            onAction = {
                val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.packageName))
                } else {
                    Intent(Settings.ACTION_SETTINGS)
                }
                overlaySettings.launch(intent)
            },
        )

        Spacer(Modifier.height(12.dp))
        PermissionCard(
            title = stringResource(R.string.permission_location_title),
            granted = fineGranted,
            explanation = stringResource(R.string.permission_location_explanation),
            actionLabel = stringResource(
                if (fineGranted) R.string.permission_enabled else R.string.permission_location_action,
            ),
            onAction = {
                finePermission.launch(
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                )
            },
        )

        if (Config.featureBackgroundLocation && fineGranted) {
            Spacer(Modifier.height(12.dp))
            PermissionCard(
                title = stringResource(R.string.permission_bg_location_title),
                granted = bgGranted,
                explanation = stringResource(R.string.permission_bg_location_explanation),
                actionLabel = stringResource(
                    if (bgGranted) R.string.permission_enabled else R.string.permission_bg_location_action,
                ),
                onAction = {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        bgPermission.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    }
                },
            )
        }

        if (Config.featureNetworkFilter) {
            Spacer(Modifier.height(12.dp))
            // Phrases indépendantes, jointes par une espace (chacune traduite entière).
            val policy = filterConfig?.policy
            val filterHint = listOfNotNull(
                stringResource(R.string.permission_filter_explanation),
                when {
                    policy == null -> null
                    policy.whitelistOnly -> stringResource(R.string.permission_filter_whitelist)
                    policy.blockedCategories.isNotEmpty() -> context.resources.getQuantityString(
                        R.plurals.permission_filter_blocked_categories,
                        policy.blockedCategories.size, policy.blockedCategories.size,
                    )
                    else -> null
                },
                if (policy?.safeSearch == true) stringResource(R.string.permission_filter_safe_search) else null,
            ).joinToString(" ")
            PermissionCard(
                title = stringResource(R.string.permission_filter_title),
                granted = filterOn,
                explanation = filterHint,
                actionLabel = stringResource(
                    if (filterOn) R.string.permission_enabled else R.string.permission_filter_action,
                ),
                onAction = { enableFilter() },
            )
        }

        if (Config.featureCallLog) {
            Spacer(Modifier.height(12.dp))
            PermissionCard(
                title = stringResource(R.string.permission_call_log_title),
                granted = callLogGranted,
                explanation = stringResource(R.string.permission_call_log_explanation),
                actionLabel = stringResource(
                    if (callLogGranted) R.string.permission_enabled else R.string.permission_call_log_action,
                ),
                onAction = { callLogPermission.launch(Manifest.permission.READ_CALL_LOG) },
            )
        }

        if (showSafety) {
            Spacer(Modifier.height(12.dp))
            // Analyse de bien-être : carte DÉDIÉE (pas la PermissionCard réutilisable,
            // car son bouton se désactive une fois accordé) → l'ado peut TOUJOURS
            // ouvrir les réglages pour ACCORDER *ou RETIRER* l'accès (contrôle réel).
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text(
                            stringResource(R.string.safety_title),
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.weight(1f),
                        )
                        AssistChip(
                            onClick = {},
                            enabled = false,
                            label = {
                                Text(
                                    stringResource(
                                        when {
                                            !analysisEnabled -> R.string.safety_status_not_enabled
                                            pauseActive -> R.string.safety_status_paused
                                            listenerEnabled -> R.string.safety_status_active
                                            else -> R.string.safety_status_needs_access
                                        },
                                    ),
                                )
                            },
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        stringResource(
                            if (analysisEnabled && listenerEnabled && !pauseActive) R.string.safety_explanation_active
                            else R.string.safety_explanation_inactive,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(10.dp))
                    Button(onClick = {
                        listenerSettings.launch(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                    }) {
                        Text(
                            stringResource(
                                if (listenerEnabled) R.string.safety_manage_access
                                else R.string.permission_enable_in_settings,
                            ),
                        )
                    }

                    if (analysisEnabled) {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            stringResource(if (pauseActive) R.string.safety_pause_active else R.string.safety_pause_hint),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(
                            enabled = !safetyBusy,
                            onClick = {
                                scope.launch {
                                    safetyBusy = true
                                    val ok = if (pauseActive) safetyClient.endPause(safetyCache)
                                             else safetyClient.startPause(safetyCache)
                                    if (ok) pauseActive = safetyCache.pauseActive
                                    safetyBusy = false
                                }
                            },
                        ) { Text(stringResource(if (pauseActive) R.string.safety_resume else R.string.safety_pause)) }
                    }
                }
            }

            // Visibilité mutuelle (K6) : l'ado voit SES propres signaux (métadonnées :
            // catégorie + gravité + date). Jamais de contenu (il n'existe pas en base).
            if (mutualVisibility && mySignals.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                InfoCard(stringResource(R.string.safety_mutual_title)) {
                    Spacer(Modifier.height(4.dp))
                    mySignals.take(20).forEach { s ->
                        val category = stringResource(safetyCategoryLabelRes(s.category))
                        val severity = stringResource(safetySeverityLabelRes(s.severity))
                        val day = s.occurredAtIso.take(10)
                        Text(
                            if (day.isNotBlank()) stringResource(R.string.safety_signal_line_dated, category, severity, day)
                            else stringResource(R.string.safety_signal_line, category, severity),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Spacer(Modifier.height(4.dp))
                    }
                    Text(
                        stringResource(R.string.safety_mutual_footer),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }

        Spacer(Modifier.height(20.dp))
        Text(
            stringResource(R.string.rights_footer),
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

/** Libellé traduit d'une catégorie de signal (wire enum app.safety_category). */
private fun safetyCategoryLabelRes(wire: String): Int = when (wire) {
    "harassment" -> R.string.safety_category_harassment
    "grooming" -> R.string.safety_category_grooming
    "sexual_content" -> R.string.safety_category_sexual_content
    "self_harm" -> R.string.safety_category_self_harm
    "drugs" -> R.string.safety_category_drugs
    else -> R.string.safety_category_other
}

/** Libellé traduit d'une gravité de signal (wire enum app.safety_severity). */
private fun safetySeverityLabelRes(wire: String): Int = when (wire) {
    "high" -> R.string.safety_severity_high
    "medium" -> R.string.safety_severity_medium
    else -> R.string.safety_severity_low
}

/** Résume le jeu de règles en phrases claires et non culpabilisantes (K2). */
private fun summarizeRules(rules: RuleSet?, res: Resources): List<String> {
    if (rules == null) return emptyList()
    val lines = mutableListOf<String>()
    val p = rules.policy

    p?.dailyLimitMinutes?.let { lines += res.getString(R.string.rule_daily_limit, it) }
    if (rules.weekdayLimits.isNotEmpty()) lines += res.getString(R.string.rule_weekday_limits)

    val blocked = rules.appRules.count { it.action == "block" }
    val limited = rules.appRules.count { it.action == "limit" }
    val always = rules.appRules.count { it.action == "always_allow" }
    if (blocked > 0) lines += res.getQuantityString(R.plurals.rule_blocked_count, blocked, blocked)
    if (limited > 0) lines += res.getQuantityString(R.plurals.rule_limited_count, limited, limited)
    if (always > 0) lines += res.getQuantityString(R.plurals.rule_always_allowed_count, always, always)

    val kinds = rules.schedules.map { it.kind }.toSet()
    if ("downtime" in kinds) lines += res.getString(R.string.rule_downtime)
    if ("blocked" in kinds) lines += res.getString(R.string.rule_blocked_slots)
    if ("allowed" in kinds) lines += res.getString(R.string.rule_allowed_slots)
    if ("school" in kinds) lines += res.getString(R.string.rule_school_mode)

    if (p?.vacationFrom != null && p.vacationUntil != null)
        lines += res.getString(R.string.rule_vacation, p.vacationFrom, p.vacationUntil)
    if (p?.blockNewApps == true) lines += res.getString(R.string.rule_block_new_apps)
    if (p?.lockSystemSettings == true) lines += res.getString(R.string.rule_lock_settings)

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
                    label = {
                        Text(stringResource(if (granted) R.string.permission_granted else R.string.permission_not_granted))
                    },
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(explanation, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(10.dp))
            Button(onClick = onAction, enabled = !granted) { Text(actionLabel) }
        }
    }
}
