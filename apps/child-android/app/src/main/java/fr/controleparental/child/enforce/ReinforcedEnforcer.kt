package fr.controleparental.child.enforce

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.UserManager
import fr.controleparental.child.service.AdminReceiver

/**
 * LOT 2 — Application RENFORCÉE via DevicePolicyManager (fiable, non contournable),
 * disponible uniquement si l'app est DEVICE OWNER (provisioning QR en entreprise /
 * configuration dédiée) ou administrateur d'appareil.
 *
 * Conformité : réservé à la supervision d'un ENFANT, VISIBLE (notification de
 * supervision persistante), réversible. Jamais de masquage furtif.
 *
 * - Blocage : setPackagesSuspended() (l'app reste visible mais ne s'ouvre pas) —
 *   plus respectueux que setApplicationHidden(). Les apps d'urgence ne sont
 *   JAMAIS suspendues (filtrées par l'appelant via la liste d'exemption).
 * - Verrouillage instantané : lockNow().
 * - Verrou des réglages système (V5) : user restrictions (date/heure, comptes,
 *   options développeur) — device owner requis.
 */
class ReinforcedEnforcer(private val context: Context) {

    private val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val admin: ComponentName = ComponentName(context, AdminReceiver::class.java)

    fun isDeviceOwner(): Boolean = dpm.isDeviceOwnerApp(context.packageName)
    fun isAdminActive(): Boolean = dpm.isAdminActive(admin)
    fun canLock(): Boolean = isAdminActive() || isDeviceOwner()

    /** Verrouille immédiatement l'écran (commande de verrouillage visible). */
    fun lockNow(): Boolean {
        if (!canLock()) return false
        return try { dpm.lockNow(); true } catch (_: SecurityException) { false }
    }

    /**
     * Suspend [toBlock] et lève la suspension de [toUnblock]. Ne fait rien si on
     * n'est pas device owner. Les packages d'urgence doivent être exclus par
     * l'appelant (jamais suspendre le composeur / la télécom).
     */
    fun applySuspensions(toBlock: Collection<String>, toUnblock: Collection<String>) {
        if (!isDeviceOwner()) return
        runCatching {
            if (toBlock.isNotEmpty()) dpm.setPackagesSuspended(admin, toBlock.toTypedArray(), true)
            if (toUnblock.isNotEmpty()) dpm.setPackagesSuspended(admin, toUnblock.toTypedArray(), false)
        }
    }

    /** Active/lève les restrictions système anti-contournement (device owner). */
    fun setSystemSettingsLock(enabled: Boolean) {
        if (!isDeviceOwner()) return
        val restrictions = buildList {
            add(UserManager.DISALLOW_CONFIG_DATE_TIME)
            add(UserManager.DISALLOW_MODIFY_ACCOUNTS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) add(UserManager.DISALLOW_DEBUGGING_FEATURES)
        }
        runCatching {
            for (r in restrictions) {
                if (enabled) dpm.addUserRestriction(admin, r) else dpm.clearUserRestriction(admin, r)
            }
        }
    }
}
