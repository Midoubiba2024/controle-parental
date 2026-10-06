package fr.controleparental.child.enforce

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Cache CHIFFRÉ des règles d'accès (LOT 2) pour une application fiable même
 * hors ligne (les règles restent celles de la dernière synchro). Clé maître
 * dans l'Android Keystore (comme SupervisionStore).
 */
class PolicyCache(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "policy_cache_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /** Dernier jeu de règles sérialisé (JSON brut renvoyé par PolicyClient). */
    var rulesJson: String?
        get() = prefs.getString(KEY_RULES, null)
        set(v) { prefs.edit().putString(KEY_RULES, v).apply() }

    /**
     * Base de packages « connus/approuvés » pour la validation d'installation
     * (B2) : capturée à la première synchro. Une app absente de cette base et
     * sans règle `allow` est considérée nouvelle → en attente d'accord parent.
     */
    var approvedPackages: Set<String>
        get() = prefs.getStringSet(KEY_APPROVED, emptySet()) ?: emptySet()
        set(v) { prefs.edit().putStringSet(KEY_APPROVED, v).apply() }

    val hasBaseline: Boolean get() = prefs.contains(KEY_APPROVED)

    /** Pause instantanée en cours (commande parent) + échéance (epoch ms, 0 = sans fin). */
    var pauseActive: Boolean
        get() = prefs.getBoolean(KEY_PAUSE, false)
        set(v) { prefs.edit().putBoolean(KEY_PAUSE, v).apply() }

    /** Désenrôlement (LOT 12b) : rien de l'ancien enfant ne doit subsister. */
    fun clear() { prefs.edit().clear().commit() }

    private companion object {
        const val KEY_RULES = "rules_json"
        const val KEY_APPROVED = "approved_packages"
        const val KEY_PAUSE = "pause_active"
    }
}
