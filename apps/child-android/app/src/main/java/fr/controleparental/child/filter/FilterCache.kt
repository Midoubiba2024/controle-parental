package fr.controleparental.child.filter

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * LOT 4 — Cache CHIFFRÉ de la configuration de filtrage (politique + listes) pour
 * une application fiable même hors ligne (le filtrage reste celui de la dernière
 * synchro). Même schéma que PolicyCache (clé maître dans l'Android Keystore).
 */
class FilterCache(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "filter_cache_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /** Config de filtrage sérialisée (JSON stable produit par FilterClient). */
    var configJson: String?
        get() = prefs.getString(KEY_CONFIG, null)
        set(v) { prefs.edit().putString(KEY_CONFIG, v).apply() }

    private companion object {
        const val KEY_CONFIG = "filter_config_json"
    }
}
