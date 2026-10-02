package fr.controleparental.child.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Stockage CHIFFRÉ de l'état d'enrôlement et de la session enfant.
 * (EncryptedSharedPreferences — clé maître dans l'Android Keystore.)
 */
class SupervisionStore(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "supervision_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    data class Enrollment(
        val deviceId: String,
        val familyId: String,
        val childId: String,
        val mode: String,
        val accessToken: String,
        val refreshToken: String,
    )

    val isEnrolled: Boolean get() = prefs.contains(KEY_DEVICE_ID)

    fun save(e: Enrollment) {
        prefs.edit()
            .putString(KEY_DEVICE_ID, e.deviceId)
            .putString(KEY_FAMILY_ID, e.familyId)
            .putString(KEY_CHILD_ID, e.childId)
            .putString(KEY_MODE, e.mode)
            .putString(KEY_ACCESS, e.accessToken)
            .putString(KEY_REFRESH, e.refreshToken)
            .apply()
    }

    /** Met à jour uniquement les jetons de session (après un refresh GoTrue). */
    fun updateTokens(accessToken: String, refreshToken: String) {
        prefs.edit()
            .putString(KEY_ACCESS, accessToken)
            .putString(KEY_REFRESH, refreshToken)
            .apply()
    }

    fun load(): Enrollment? {
        if (!isEnrolled) return null
        return Enrollment(
            deviceId = prefs.getString(KEY_DEVICE_ID, "")!!,
            familyId = prefs.getString(KEY_FAMILY_ID, "")!!,
            childId = prefs.getString(KEY_CHILD_ID, "")!!,
            mode = prefs.getString(KEY_MODE, "standard")!!,
            accessToken = prefs.getString(KEY_ACCESS, "")!!,
            refreshToken = prefs.getString(KEY_REFRESH, "")!!,
        )
    }

    /** Filigrane de la dernière métadonnée d'appel remontée (epoch ms). */
    var callLogWatermark: Long
        get() = prefs.getLong(KEY_CALL_WM, 0L)
        set(value) { prefs.edit().putLong(KEY_CALL_WM, value).apply() }

    /**
     * captured_at (epoch ms) du relevé device_status EN COURS, conservé tant que
     * l'upload n'a pas abouti. En le RÉUTILISANT lors d'un rejeu, l'upsert sur
     * (device_id, captured_at) devient idempotent : une réponse perdue puis
     * ré-émise ne crée pas de doublon. 0 = aucun relevé en attente.
     */
    var pendingStatusCapturedAt: Long
        get() = prefs.getLong(KEY_STATUS_TS, 0L)
        set(value) { prefs.edit().putLong(KEY_STATUS_TS, value).apply() }

    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_FAMILY_ID = "family_id"
        const val KEY_CHILD_ID = "child_id"
        const val KEY_MODE = "mode"
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_CALL_WM = "call_log_watermark"
        const val KEY_STATUS_TS = "pending_status_captured_at"
    }
}
