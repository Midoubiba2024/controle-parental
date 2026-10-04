package fr.controleparental.child.safety

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * LOT 6 — Cache CHIFFRÉ de la CONFIG d'analyse (consentement + profil + pause), pour
 * que le NotificationListenerService décide SANS appel réseau bloquant à chaque
 * notification. Même schéma chiffré que FilterCache (clé maître Android Keystore).
 *
 * 🔴 LIGNE ROUGE : ce cache ne contient QUE des booléens de config et des
 * horodatages — jamais de texte de notification, jamais de signal avec contenu.
 */
class SafetyCache(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "safety_cache_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /** L'analyse est consentie/activée par le parent (OFF par défaut). */
    var analysisEnabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, false)
        set(v) { prefs.edit().putBoolean(KEY_ENABLED, v).apply() }

    /** Visibilité mutuelle (mode ado, K6). */
    var mutualVisibility: Boolean
        get() = prefs.getBoolean(KEY_MUTUAL, true)
        set(v) { prefs.edit().putBoolean(KEY_MUTUAL, v).apply() }

    /** Profil preteen/teen (false = young_child ⇒ jamais d'analyse). */
    var teenProfile: Boolean
        get() = prefs.getBoolean(KEY_TEEN, false)
        set(v) { prefs.edit().putBoolean(KEY_TEEN, v).apply() }

    /** Une pause de confidentialité (K8) est active (l'ado a suspendu l'analyse). */
    var pauseActive: Boolean
        get() = prefs.getBoolean(KEY_PAUSE, false)
        set(v) { prefs.edit().putBoolean(KEY_PAUSE, v).apply() }

    /** Dernière synchro réussie de la config (epoch ms) ; 0 = jamais. */
    var lastSyncAt: Long
        get() = prefs.getLong(KEY_SYNC, 0L)
        set(v) { prefs.edit().putLong(KEY_SYNC, v).apply() }

    /** True tant qu'on n'a pas encore pu synchroniser une config fiable. */
    val neverSynced: Boolean get() = lastSyncAt == 0L

    fun toConfig(): SafetyConfig = SafetyConfig(analysisEnabled = analysisEnabled, teenProfile = teenProfile)

    /** Désenrôlement (LOT 12b) : rien de l'ancien enfant ne doit subsister. */
    fun clear() { prefs.edit().clear().commit() }

    private companion object {
        const val KEY_ENABLED = "analysis_enabled"
        const val KEY_MUTUAL = "mutual_visibility"
        const val KEY_TEEN = "teen_profile"
        const val KEY_PAUSE = "pause_active"
        const val KEY_SYNC = "last_sync_at"
    }
}
