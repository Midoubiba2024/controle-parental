package fr.controleparental.child

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import fr.controleparental.child.data.SupabaseClient
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.service.SupervisionService
import fr.controleparental.child.ui.MyDataScreen
import fr.controleparental.child.ui.PairingScreen
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

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
        // Si déjà enrôlé, (re)démarrer la notification de supervision, puis
        // vérifier que le parent n'a pas retiré l'appareil entre-temps
        // (docs/14-APPAIRAGE.md §5 : détection au démarrage).
        if (store.isEnrolled) {
            SupervisionService.start(this)
            lifecycleScope.launch { SupabaseClient(store).verifyDeviceActive(force = true) }
        }

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier) {
                    var enrolled by remember { mutableStateOf(store.isEnrolled) }
                    // Session perdue / appareil retiré (n'importe quel client du
                    // processus) : retour à l'écran d'appairage, avec le motif.
                    val unenrolled by SupervisionStore.unenrolled.collectAsState()
                    LaunchedEffect(unenrolled) {
                        if (unenrolled != null) enrolled = store.isEnrolled
                    }
                    val enrollment = remember(enrolled, unenrolled) { if (enrolled) store.load() else null }
                    if (enrollment != null) {
                        MyDataScreen(enrollment = enrollment)
                    } else {
                        PairingScreen(
                            store = store,
                            notice = unenrolled,
                            onEnrolled = {
                                SupervisionService.start(this@MainActivity)
                                enrolled = true
                            },
                        )
                    }
                }
            }
        }
    }
}
