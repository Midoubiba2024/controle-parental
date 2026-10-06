package fr.controleparental.child

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import fr.controleparental.child.data.SupabaseClient
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.service.SupervisionService
import fr.controleparental.child.service.Unenrollment
import fr.controleparental.child.ui.MyDataScreen
import fr.controleparental.child.ui.PairingScreen
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    /** Notifications autorisées (app + canal « supervision ») — relu à chaque reprise. */
    private var notificationsAllowed by mutableStateOf(true)

    override fun onResume() {
        super.onResume()
        notificationsAllowed = SupervisionService.notificationsAllowed(this)
    }

    private val requestNotif = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* l'état de supervision reste actif même si la notif est refusée */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestNotif.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        val store = SupervisionStore(this)
        if (store.isEnrolled) {
            // Vérifier que le parent n'a pas retiré l'appareil entre-temps
            // (docs/14-APPAIRAGE.md §5 : détection au démarrage).
            // Forcée au premier lancement seulement ; une recréation (rotation) reste
            // soumise au plafond d'une vérification par minute.
            val force = savedInstanceState == null
            lifecycleScope.launch { SupabaseClient(store).verifyDeviceActive(force = force) }
        } else {
            // Filet LOT 12b : rejouer un démontage interrompu (processus tué).
            Unenrollment.resumeIfPending(this)
        }

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier) {
                    // Enrôlement courant : alimenté par l'enregistrement lui-même
                    // (appairage réussi, désenrôlement), donc juste même après une
                    // rotation pendant « Association… ».
                    val current by SupervisionStore.current.collectAsState()
                    val unenrolled by SupervisionStore.unenrolled.collectAsState()
                    val enrollment = remember(current) { if (current != null) store.load() else null }
                    LaunchedEffect(current) {
                        // (Re)démarre la notification de supervision dès qu'on est enrôlé.
                        if (current != null) SupervisionService.start(this@MainActivity)
                    }
                    if (enrollment != null) {
                        Column {
                            // Transparence (LOT 12b) : sans notification, la supervision
                            // ne se voit plus — collecte et analyse sont suspendues (seul
                            // l'état des permissions est signalé au parent) ; on explique
                            // pourquoi et comment la rétablir.
                            if (!notificationsAllowed) NotificationsOffBanner { openNotificationSettings() }
                            MyDataScreen(enrollment = enrollment)
                        }
                    } else {
                        PairingScreen(store = store, notice = unenrolled)
                    }
                }
            }
        }
    }

    private fun openNotificationSettings() {
        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        runCatching { startActivity(intent) }
            .onFailure {
                runCatching {
                    startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)),
                    )
                }
            }
    }
}

/** Bandeau : notifications refusées ou canal de supervision coupé. */
@Composable
private fun NotificationsOffBanner(onOpenSettings: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.notifications_off_banner),
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                color = MaterialTheme.colorScheme.onErrorContainer,
            )
            Spacer(Modifier.height(8.dp))
            Button(onClick = onOpenSettings) { Text(stringResource(R.string.notifications_off_button)) }
        }
    }
}
