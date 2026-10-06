package fr.controleparental.child.data

import android.content.Context
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * Signal de TRANSPARENCE vers le parent (LOT 12b) : « notifications coupées sur
 * l'appareil de l'enfant ». Depuis que toute collecte s'arrête sans notification
 * de supervision visible, le relevé device_status complet ne part plus dans ce
 * cas ; on envoie donc une ligne réduite à l'ÉTAT DES PERMISSIONS (booléens, sans
 * batterie ni stockage ni contenu) dans le canal existant — la console affiche
 * déjà la bannière « protections désactivées ». Aucune migration.
 * Au plus une fois par heure après un succès, 5 min après un échec ; jamais deux
 * envois simultanés ; hors du chemin critique de la boucle.
 */
object SupervisionSignal {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val inFlight = AtomicBoolean(false)
    @Volatile private var nextAllowedMs = 0L
    private const val SUCCESS_INTERVAL_MS = 60 * 60_000L
    private const val FAILURE_BACKOFF_MS = 5 * 60_000L

    fun reportNotificationsOffAsync(context: Context, store: SupervisionStore) {
        if (System.currentTimeMillis() < nextAllowedMs) return
        val app = context.applicationContext ?: context
        scope.launch { reportNotificationsOff(app, store) }
    }

    suspend fun reportNotificationsOff(context: Context, store: SupervisionStore) {
        val now = System.currentTimeMillis()
        if (now < nextAllowedMs || !inFlight.compareAndSet(false, true)) return
        // Recul armé AVANT la tentative : une panne ne provoque jamais un envoi par tick.
        nextAllowedMs = now + FAILURE_BACKOFF_MS
        try {
            val e = store.load() ?: return
            val perms = runCatching { DeviceStatusCollector(context).collect() }.getOrNull()
            val row = JSONObject()
                .put("family_id", e.familyId)
                .put("child_id", e.childId)
                .put("device_id", e.deviceId)
                // Coupées au sens de la supervision : autorisation OU canal « supervision ».
                .put("perm_notifications", false)
                .put("perm_usage_access", perms?.permUsageAccess ?: JSONObject.NULL)
                .put("perm_overlay", perms?.permOverlay ?: JSONObject.NULL)
                .put("perm_location", perms?.permLocation ?: JSONObject.NULL)
                .put("captured_at", Instant.ofEpochMilli(now).toString())
            val res = SupabaseClient(store).upsert(
                "device_status", JSONArray().put(row),
                onConflict = "device_id,captured_at", ignoreDuplicates = true,
            )
            if (res is SupabaseClient.Result.Ok) nextAllowedMs = now + SUCCESS_INTERVAL_MS
        } finally {
            inFlight.set(false)
        }
    }
}
