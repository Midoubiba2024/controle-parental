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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.service.SupervisionService
import fr.controleparental.child.ui.MyDataScreen
import fr.controleparental.child.ui.PairingScreen

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
        // Si déjà enrôlé, (re)démarrer la notification de supervision.
        if (store.isEnrolled) SupervisionService.start(this)

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier) {
                    var enrolled by remember { mutableStateOf(store.isEnrolled) }
                    if (enrolled) {
                        MyDataScreen(enrollment = store.load()!!)
                    } else {
                        PairingScreen(
                            store = store,
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
