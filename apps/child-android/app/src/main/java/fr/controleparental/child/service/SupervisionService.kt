package fr.controleparental.child.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import fr.controleparental.child.location.LocationClient
import fr.controleparental.child.MainActivity
import fr.controleparental.child.R
import fr.controleparental.child.data.AppInventoryCollector
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.enforce.BlockOverlay
import fr.controleparental.child.enforce.CommandExecutor
import fr.controleparental.child.enforce.Decision
import fr.controleparental.child.enforce.EnforcementManager
import fr.controleparental.child.enforce.PolicyCache
import fr.controleparental.child.enforce.PolicyClient
import fr.controleparental.child.enforce.ReinforcedEnforcer
import fr.controleparental.child.location.LocationCoordinator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Service de premier plan affichant une notification PERSISTANTE de supervision,
 * et exécutant la boucle d'APPLICATION DES RÈGLES (LOT 2).
 *
 * Garde-fou anti-stalkerware central (docs/02-CONFORMITE.md) : la supervision est
 * VISIBLE et non masquable. Cette unique notification couvre à la fois
 * l'observation (LOT 1) et l'application des règles (LOT 2).
 *
 * Boucle (tant que le service vit) :
 *   * ~3 s  : évalue l'app au premier plan → affiche/masque l'overlay de blocage
 *   * ~15 s : récupère et applique les commandes parent (pause/verrouillage/…)
 *   * ~5 min: resynchronise les règles + applique les suspensions (Renforcé)
 * Repli fiable sous Doze pour la collecte via WorkManager (MetricsWorker) ;
 * accélération par push FCM prévue au LOT 5 (le modèle ne dépend pas de FCM).
 */
class SupervisionService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var loopStarted = false

    private lateinit var overlay: BlockOverlay
    private lateinit var manager: EnforcementManager
    private lateinit var reinforced: ReinforcedEnforcer
    private lateinit var executor: CommandExecutor
    private lateinit var policyClient: PolicyClient
    private lateinit var location: LocationCoordinator

    // Receiver dynamique batterie faible (ACTION_BATTERY_LOW ne peut pas être
    // déclaré en manifeste pour un broadcast implicite depuis Android 8).
    private var batteryReceiver: BroadcastReceiver? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        // Objets touchant WindowManager créés sur le thread principal.
        overlay = BlockOverlay(this)
        manager = EnforcementManager(this).apply { loadFromCache() }
        reinforced = ReinforcedEnforcer(this)
        location = LocationCoordinator(this)
        executor = CommandExecutor(this, PolicyCache(this), reinforced, location)
        policyClient = PolicyClient(SupervisionStore(this))
        registerBatteryReceiver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Type de service de premier plan calculé À L'EXÉCUTION : dataSync toujours
        // (observation L1), + location UNIQUEMENT si la permission est accordée ET
        // qu'on ne démarre PAS depuis le boot. Deux garde-fous Android 14/15 :
        //   * le type `location` exige la permission au démarrage (sinon crash) ;
        //   * depuis un BOOT_COMPLETED, démarrer un FGS `location` (et `dataSync`
        //     sous Android 15) est restreint → on n'y ajoute jamais `location`,
        //     et on entoure startForeground d'un try/catch (repli gracieux : le
        //     service always-on ne doit JAMAIS tomber à cause de la localisation).
        // Après l'octroi de la permission, l'app relance le service (foreground)
        // pour « upgrader » au type `location`.
        val fromBoot = intent?.getBooleanExtra(EXTRA_FROM_BOOT, false) == true
        var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        if (!fromBoot && LocationClient(this).hasAnyLocationPermission()) {
            type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        }
        try {
            ServiceCompat.startForeground(this, NOTIF_ID, buildNotification(), type)
        } catch (e: Exception) {
            // ForegroundServiceStartNotAllowedException (API 31+) / SecurityException :
            // démarrage FGS refusé dans cet état (ex. dataSync depuis le boot sur
            // Android 15). On s'arrête proprement ; le service repartira à la
            // prochaine ouverture de l'app (point d'entrée foreground).
            stopSelf()
            return START_NOT_STICKY
        }
        MetricsWorker.schedule(this)
        if (!loopStarted) { loopStarted = true; scope.launch { loop() } }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        runCatching { overlay.hide() }
        batteryReceiver?.let { runCatching { unregisterReceiver(it) } }
        super.onDestroy()
    }

    private fun registerBatteryReceiver() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == Intent.ACTION_BATTERY_LOW) {
                    scope.launch { runCatching { location.onBatteryLow() } }
                }
            }
        }
        // ACTION_BATTERY_LOW est un broadcast système protégé (exempté de
        // l'obligation d'export sur Android 14) ; on passe NOT_EXPORTED par sûreté.
        ContextCompat.registerReceiver(
            this, receiver, IntentFilter(Intent.ACTION_BATTERY_LOW),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        batteryReceiver = receiver
    }

    private suspend fun loop() {
        var tick = 0L
        while (scope.isActive) {
            if (!SupervisionStore(this).isEnrolled) { withContext(Dispatchers.Main) { overlay.hide() }; delay(TICK_MS); continue }

            if (tick % SYNC_EVERY == 0L) {
                runCatching { syncRules() }
                runCatching { location.onSync() }   // réglages + ré-enregistrement geofences
            }
            if (tick % COMMANDS_EVERY == 0L) {
                runCatching { executor.processPending() }
                runCatching { executor.processMessages() }  // messages parent (LOT 5)
            }
            // Localisation : relevé périodique (si activé) + diffusion SOS live.
            // Le coordinateur borne lui-même ses cadences, l'appel à chaque tick
            // est donc bon marché.
            runCatching { location.onTick() }

            val res = runCatching { manager.evaluateForeground() }.getOrNull()
            withContext(Dispatchers.Main) { applyDecision(res) }

            tick++
            delay(TICK_MS)
        }
    }

    private suspend fun syncRules() {
        val installed = runCatching { AppInventoryCollector(this).collect().map { it.packageName }.toSet() }
            .getOrDefault(emptySet())
        val rs = policyClient.syncAndCache(PolicyCache(this), installed)
        if (rs != null) {
            manager.setRules(rs)
            manager.applyStaticSuspensions(reinforced, installed)
            reinforced.setSystemSettingsLock(rs.policy?.lockSystemSettings == true)
        } else {
            manager.loadFromCache()
        }
    }

    /** Doit s'exécuter sur le thread principal (WindowManager). */
    private fun applyDecision(res: Pair<String, Decision>?) {
        if (res == null) { overlay.hide(); return }
        val (pkg, decision) = res
        if (decision.blocked) {
            overlay.show(decision) { scope.launch { requestExtraTime(pkg) } }
        } else {
            overlay.hide()
        }
    }

    private suspend fun requestExtraTime(pkg: String) {
        val payload = JSONObject().put("minutes", 15).put("scope", "app").put("package_name", pkg)
        val ok = policyClient.createRequest("extra_time", payload, null)
        withContext(Dispatchers.Main) {
            Toast.makeText(
                this@SupervisionService,
                if (ok) "Demande envoyée à tes parents." else "Demande impossible (hors ligne ?).",
                Toast.LENGTH_SHORT,
            ).show()
        }
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.supervision_channel),
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = "Indique que la supervision parentale est active." }
            nm.createNotificationChannel(channel)
        }

        val openApp = android.app.PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            android.app.PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Supervision parentale active")
            .setContentText("Tes parents t'accompagnent. Touche pour voir tes données.")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setOngoing(true)            // non balayable
            .setContentIntent(openApp)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "supervision"
        private const val NOTIF_ID = 1001
        private const val TICK_MS = 3_000L
        private const val COMMANDS_EVERY = 5L     // ~15 s
        private const val SYNC_EVERY = 100L       // ~5 min
        const val EXTRA_FROM_BOOT = "from_boot"

        fun start(context: Context, fromBoot: Boolean = false) {
            val intent = Intent(context, SupervisionService::class.java)
                .putExtra(EXTRA_FROM_BOOT, fromBoot)
            // Le démarrage lui-même peut être refusé depuis certains états (boot
            // Android 15) → runCatching pour ne pas faire tomber l'appelant.
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            }
        }
    }
}
