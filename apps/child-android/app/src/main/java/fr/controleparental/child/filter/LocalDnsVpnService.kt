package fr.controleparental.child.filter

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import fr.controleparental.child.Config
import fr.controleparental.child.MainActivity
import fr.controleparental.child.data.SupervisionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.time.Instant

/**
 * LOT 4 — VpnService LOCAL : sinkhole DNS userspace (C1/C2/C3/C4/C7).
 *
 * ================================ LIGNE ROUGE ================================
 * Ce VPN est STRICTEMENT LOCAL. Il n'intercepte QUE le trafic DNS (port 53) vers
 * un résolveur virtuel, décide allow/block/réécriture par NOM DE DOMAINE, puis
 * transfère les requêtes autorisées à un résolveur public. Il n'y a :
 *   * AUCUN serveur distant propriétaire (pas de proxy, pas de tunnel) ;
 *   * AUCUN déchiffrement TLS, AUCUN MITM, AUCUNE inspection de contenu/payload ;
 *   * AUCUNE capture d'URL complète — on ne lit que le nom demandé dans l'en-tête
 *     DNS, pour le filtrer et le journaliser en MÉTADONNÉE.
 * Un VPN qui déchiffrerait HTTPS serait un spyware → interdit (docs/02-CONFORMITE).
 * ============================================================================
 *
 * TRANSPARENCE : le VPN est visible (icône clé Android + notification de
 * supervision dédiée). ANTI-CONTOURNEMENT (C9) transparent : onRevoke() signale
 * la coupure au parent (filter_status) ET à l'enfant — jamais en cachette.
 *
 * Périmètre tranche 1 : IPv4 + UDP/53 (cas ultra-majoritaire). Le reste passe
 * (fail-open) → on ne casse jamais la connectivité. Only-DNS routing : seule
 * l'adresse du résolveur virtuel est routée dans le tunnel ; tout le reste du
 * trafic est inchangé (112 et services essentiels jamais entravés).
 */
class LocalDnsVpnService : VpnService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var vpn: ParcelFileDescriptor? = null
    private val engine = DnsFilterEngine(FilterConfig.EMPTY)
    private lateinit var store: SupervisionStore
    private lateinit var filterClient: FilterClient
    private lateinit var cache: FilterCache

    private val writeLock = Any()
    private val pending = ArrayDeque<FilterClient.DomainEvent>()
    @Volatile private var logAllowed = false

    override fun onCreate() {
        super.onCreate()
        store = SupervisionStore(this)
        filterClient = FilterClient(store)
        cache = FilterCache(this)
        // Démarrage avec la dernière config connue (hors ligne OK).
        filterClient.fromCache(cache)?.let { engine.update(it); logAllowed = it.policy.logAllowed }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopVpn(reportInactive = true)
            return START_NOT_STICKY
        }
        startForegroundSafely()
        if (vpn == null) establish()
        return START_STICKY
    }

    private fun establish() {
        val pfd = runCatching {
            Builder()
                .setSession("Filtrage parental")
                .addAddress(VPN_ADDRESS, 32)
                .addDnsServer(VPN_DNS)
                .addRoute(VPN_DNS, 32)      // seul le DNS virtuel entre dans le tunnel
                .setMtu(MTU)
                .setBlocking(true)
                .also { b -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) b.allowBypass() }
                .establish()
        }.getOrNull()

        if (pfd == null) {
            // Consentement non accordé (prepare non appelé) ou échec : on s'arrête
            // proprement. L'écran « mes données » propose d'activer le filtrage.
            stopVpn(reportInactive = false)
            return
        }
        vpn = pfd
        scope.launch { readLoop(pfd) }
        scope.launch { syncLoop() }
    }

    // --- Boucle de lecture du tunnel ----------------------------------------
    private suspend fun readLoop(pfd: ParcelFileDescriptor) {
        val input = FileInputStream(pfd.fileDescriptor)
        val output = FileOutputStream(pfd.fileDescriptor)
        val buffer = ByteArray(MTU)
        while (scope.isActive) {
            val n = runCatching { input.read(buffer) }.getOrNull() ?: break
            if (n <= 0) continue
            val packet = buffer.copyOf(n)          // copie avant réécriture du buffer
            scope.launch { handlePacket(packet, output) }
        }
    }

    private fun handlePacket(packet: ByteArray, output: FileOutputStream) {
        val dg = IpUdp.parse(packet, packet.size) ?: return
        if (dg.dstPort != 53) return               // uniquement DNS
        val q = DnsPacket.parseQuestion(dg.payload) ?: return

        when (val decision = engine.decide(q.name)) {
            is DnsFilterEngine.Decision.Allow -> {
                val resp = forward(dg.payload) ?: return
                writeResponse(output, dg, resp)
                if (logAllowed) enqueue(q.name, null, "allowed")
            }
            is DnsFilterEngine.Decision.Block -> {
                writeResponse(output, dg, DnsPacket.buildNxDomain(dg.payload, q))
                enqueue(q.name, decision.category, "blocked")
            }
            is DnsFilterEngine.Decision.Rewrite -> {
                writeResponse(output, dg, DnsPacket.buildCname(dg.payload, q, decision.target))
                enqueue(q.name, null, "rewritten")
            }
        }
    }

    /** Transfère une requête DNS autorisée au résolveur public (socket protégé). */
    private fun forward(query: ByteArray): ByteArray? = runCatching {
        DatagramSocket().use { sock ->
            protect(sock)                          // le socket sort du tunnel (pas de boucle)
            sock.soTimeout = UPSTREAM_TIMEOUT_MS
            val addr = InetSocketAddress(InetAddress.getByName(Config.dnsUpstream), 53)
            sock.send(DatagramPacket(query, query.size, addr))
            val resp = ByteArray(MTU)
            val dp = DatagramPacket(resp, resp.size)
            sock.receive(dp)
            resp.copyOf(dp.length)
        }
    }.getOrNull()

    private fun writeResponse(output: FileOutputStream, dg: IpUdp.Datagram, dnsPayload: ByteArray) {
        // Réponse : du résolveur virtuel (dst d'origine) vers le client (src d'origine).
        val pkt = IpUdp.build(dg.dstIp, 53, dg.srcIp, dg.srcPort, dnsPayload)
        runCatching { synchronized(writeLock) { output.write(pkt); output.flush() } }
    }

    private fun enqueue(domain: String, category: String?, action: String) {
        synchronized(pending) {
            if (pending.size >= MAX_BUFFER) pending.removeFirst()
            pending.addLast(FilterClient.DomainEvent(domain, category, action, Instant.now().toString()))
        }
    }

    // --- Synchro politique + heartbeat + flush du journal -------------------
    private suspend fun syncLoop() {
        var tick = 0L
        while (scope.isActive) {
            if (store.isEnrolled) {
                if (tick % SYNC_EVERY == 0L) {
                    runCatching { filterClient.syncAndCache(cache) }.getOrNull()?.let {
                        engine.update(it); logAllowed = it.policy.logAllowed
                    }
                    runCatching { filterClient.reportStatus(vpnActive = true) }
                }
                runCatching { flushEvents() }
            }
            tick++
            delay(FLUSH_EVERY_MS)
        }
    }

    private suspend fun flushEvents() {
        val batch: List<FilterClient.DomainEvent>
        synchronized(pending) {
            if (pending.isEmpty()) return
            batch = pending.toList(); pending.clear()
        }
        val ok = filterClient.logDomainEvents(batch)
        if (!ok) synchronized(pending) {           // remet en tête en cas d'échec réseau
            batch.asReversed().forEach { if (pending.size < MAX_BUFFER) pending.addFirst(it) }
        }
    }

    // --- Cycle de vie / transparence ----------------------------------------
    override fun onRevoke() {
        // L'utilisateur (ou un autre VPN) a désactivé notre VPN. ANTI-CONTOURNEMENT
        // TRANSPARENT (C9) : on le signale au parent et à l'enfant, jamais en secret.
        scope.launch { runCatching { filterClient.reportStatus(vpnActive = false) } }
        notifyDisabled()
        stopVpn(reportInactive = false)
        super.onRevoke()
    }

    override fun onDestroy() {
        scope.cancel()
        runCatching { vpn?.close() }
        vpn = null
        super.onDestroy()
    }

    private fun stopVpn(reportInactive: Boolean) {
        if (reportInactive) scope.launch { runCatching { filterClient.reportStatus(vpnActive = false) } }
        runCatching { vpn?.close() }
        vpn = null
        stopSelf()
    }

    private fun startForegroundSafely() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Filtrage du web", NotificationManager.IMPORTANCE_LOW)
                    .apply { description = "Indique que le filtrage web parental est actif." },
            )
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Filtrage du web actif")
            .setContentText("Les sites inappropriés sont filtrés. Touche pour en savoir plus.")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setOngoing(true)
            .setContentIntent(open)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        runCatching { ServiceCompat.startForeground(this, NOTIF_ID, notif, type) }
    }

    private fun notifyDisabled() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(ALERT_CHANNEL, "Filtrage désactivé", NotificationManager.IMPORTANCE_HIGH),
            )
        }
        val n = NotificationCompat.Builder(this, ALERT_CHANNEL)
            .setContentTitle("Filtrage du web désactivé")
            .setContentText("Le filtrage a été coupé. Tes parents en sont informés (rien n'est caché).")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        runCatching { nm.notify(ALERT_NOTIF_ID, n) }
    }

    companion object {
        const val ACTION_STOP = "fr.controleparental.child.filter.STOP"
        private const val VPN_ADDRESS = "10.111.0.2"
        private const val VPN_DNS = "10.111.0.1"
        private const val MTU = 1500
        private const val UPSTREAM_TIMEOUT_MS = 5_000
        private const val FLUSH_EVERY_MS = 30_000L
        private const val SYNC_EVERY = 4L          // ~2 min (4 × 30 s)
        private const val MAX_BUFFER = 500
        private const val CHANNEL_ID = "web_filter"
        private const val ALERT_CHANNEL = "web_filter_alert"
        private const val NOTIF_ID = 1002
        private const val ALERT_NOTIF_ID = 2003

        /** Démarre le service (le consentement VpnService.prepare doit être accordé). */
        fun start(context: Context) {
            val intent = Intent(context, LocalDnsVpnService::class.java)
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
                else context.startService(intent)
            }
        }

        fun stop(context: Context) {
            runCatching {
                context.startService(Intent(context, LocalDnsVpnService::class.java).setAction(ACTION_STOP))
            }
        }
    }
}
