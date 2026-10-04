package fr.controleparental.child.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import fr.controleparental.child.pairing.AuthSession
import fr.controleparental.child.pairing.PairingProtocol
import fr.controleparental.child.service.Unenrollment
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Stockage CHIFFRÉ de l'état d'enrôlement et de la session enfant.
 * (EncryptedSharedPreferences — clé maître dans l'Android Keystore.)
 */
class SupervisionStore(context: Context) {

    private val appContext: Context = context.applicationContext ?: context

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
        /** Expiration de [accessToken], secondes epoch de l'horloge LOCALE (0 = inconnue). */
        val expiresAt: Long = 0L,
        /** Réception de [accessToken], même horloge (0 = inconnue). */
        val obtainedAt: Long = 0L,
    )

    init {
        // État observable initialisé UNE fois par processus depuis le stockage.
        if (!stateLoaded) synchronized(Companion) {
            if (!stateLoaded) {
                _current.value = readIds()
                _unenrolled.value = prefs.getString(KEY_UNENROLL_REASON, null)
                    ?.let { runCatching { UnenrollReason.valueOf(it) }.getOrNull() }
                stateLoaded = true
            }
        }
    }

    val isEnrolled: Boolean get() = prefs.contains(KEY_DEVICE_ID)

    private fun readIds(): Ids? {
        val device = prefs.getString(KEY_DEVICE_ID, null) ?: return null
        return Ids(device, prefs.getString(KEY_CHILD_ID, "")!!)
    }

    /**
     * Appairage réussi (LOT 12) : la session anonyme EN ATTENTE devient la session
     * de l'appareil, et le blocage anti force brute est levé. Écriture synchrone
     * (`commit`) : jamais d'enrôlement à moitié écrit, ni de session en attente
     * réutilisée après succès.
     */
    fun completeEnrollment(e: Enrollment) {
        prefs.edit()
            .putString(KEY_DEVICE_ID, e.deviceId)
            .putString(KEY_FAMILY_ID, e.familyId)
            .putString(KEY_CHILD_ID, e.childId)
            .putString(KEY_MODE, e.mode)
            .putString(KEY_ACCESS, e.accessToken)
            .putString(KEY_REFRESH, e.refreshToken)
            .putLong(KEY_EXPIRES_AT, e.expiresAt)
            .putLong(KEY_OBTAINED_AT, e.obtainedAt)
            .remove(KEY_PENDING_ACCESS)
            .remove(KEY_PENDING_REFRESH)
            .remove(KEY_PENDING_EXPIRES_AT)
            .remove(KEY_PENDING_USER_ID)
            .remove(KEY_PENDING_OBTAINED_AT)
            .remove(KEY_PAIRING_BLOCKED_UNTIL)
            .remove(KEY_UNENROLL_REASON)
            .commit()
        _unenrolled.value = null
        _current.value = Ids(e.deviceId, e.childId)
    }

    /**
     * Met à jour les jetons de la session de l'appareil (après un refresh GoTrue).
     * Les refresh tokens sont À USAGE UNIQUE (rotation) : `commit()` pour que le
     * nouveau soit écrit AVANT tout usage de l'access token (docs/14-APPAIRAGE.md §4).
     */
    fun updateTokens(s: AuthSession) {
        prefs.edit()
            .putString(KEY_ACCESS, s.accessToken)
            .putString(KEY_REFRESH, s.refreshToken)
            .putLong(KEY_EXPIRES_AT, s.expiresAt)
            .putLong(KEY_OBTAINED_AT, s.obtainedAt)
            .commit()
    }

    /**
     * Session ANONYME en attente d'appairage (§5) : créée au premier appui sur
     * « Associer », RÉUTILISÉE pour les essais suivants (mêmes limites côté
     * serveur), jetée si le serveur la refuse ou après succès.
     */
    fun loadPendingSession(): AuthSession? {
        val access = prefs.getString(KEY_PENDING_ACCESS, null) ?: return null
        val refresh = prefs.getString(KEY_PENDING_REFRESH, null) ?: return null
        val userId = prefs.getString(KEY_PENDING_USER_ID, null) ?: return null
        return AuthSession(
            access, refresh, prefs.getLong(KEY_PENDING_EXPIRES_AT, 0L), userId,
            obtainedAt = prefs.getLong(KEY_PENDING_OBTAINED_AT, 0L),
        )
    }

    fun savePendingSession(s: AuthSession) {
        prefs.edit()
            .putString(KEY_PENDING_ACCESS, s.accessToken)
            .putString(KEY_PENDING_REFRESH, s.refreshToken)
            .putLong(KEY_PENDING_EXPIRES_AT, s.expiresAt)
            .putString(KEY_PENDING_USER_ID, s.userId)
            .putLong(KEY_PENDING_OBTAINED_AT, s.obtainedAt)
            .commit()
    }

    fun clearPendingSession() {
        prefs.edit()
            .remove(KEY_PENDING_ACCESS)
            .remove(KEY_PENDING_REFRESH)
            .remove(KEY_PENDING_EXPIRES_AT)
            .remove(KEY_PENDING_USER_ID)
            .remove(KEY_PENDING_OBTAINED_AT)
            .commit()
    }

    /**
     * Fin du blocage `too_many_attempts` (epoch ms, 0 = aucun). Persisté : fermer
     * et rouvrir l'appli ne contourne pas l'attente demandée par le serveur.
     * Jamais plus de 15 min dans le futur (PairingProtocol.effectiveBlockedUntil).
     */
    var pairingBlockedUntil: Long
        // Borné à 15 min à la lecture : persisté en heure murale (horloge reculée).
        get() = PairingProtocol.effectiveBlockedUntil(
            prefs.getLong(KEY_PAIRING_BLOCKED_UNTIL, 0L), System.currentTimeMillis(),
        )
        set(value) { prefs.edit().putLong(KEY_PAIRING_BLOCKED_UNTIL, value).apply() }

    /**
     * Désenrôlement subi (§4 session perdue, §5 appareil retiré par le parent) :
     * efface l'enrôlement ET la session locale (tout le stockage de supervision)
     * en écrivant, dans le MÊME commit, le motif et un drapeau « démontage en
     * attente ». Puis lance le démontage centralisé ([Unenrollment]) : levée de
     * toutes les restrictions, notification visible, arrêt du service — quel que
     * soit l'appelant (worker, VPN, boucle, écran). Plus aucune requête ne part
     * ensuite : tous les clients s'arrêtent sur « non enrôlé ».
     */
    fun unenroll(reason: UnenrollReason) {
        prefs.edit().clear()
            .putString(KEY_UNENROLL_REASON, reason.name)
            .putBoolean(KEY_TEARDOWN_PENDING, true)
            .commit()
        _current.value = null
        _unenrolled.value = reason
        Unenrollment.releaseAsync(appContext, reason)
    }

    /** Message de désenrôlement affiché : consommé par l'écran d'appairage. */
    fun acknowledgeUnenrolled() {
        prefs.edit().remove(KEY_UNENROLL_REASON).apply()
        _unenrolled.value = null
    }

    /**
     * Un démontage ([Unenrollment]) a été demandé et n'est pas encore terminé
     * (processus tué pendant le démontage) : rejoué au démarrage et au boot.
     */
    var teardownPending: Boolean
        get() = prefs.getBoolean(KEY_TEARDOWN_PENDING, false)
        set(value) { prefs.edit().putBoolean(KEY_TEARDOWN_PENDING, value).commit() }

    fun load(): Enrollment? {
        if (!isEnrolled) return null
        return Enrollment(
            deviceId = prefs.getString(KEY_DEVICE_ID, "")!!,
            familyId = prefs.getString(KEY_FAMILY_ID, "")!!,
            childId = prefs.getString(KEY_CHILD_ID, "")!!,
            mode = prefs.getString(KEY_MODE, "standard")!!,
            accessToken = prefs.getString(KEY_ACCESS, "")!!,
            refreshToken = prefs.getString(KEY_REFRESH, "")!!,
            expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0L),
            obtainedAt = prefs.getLong(KEY_OBTAINED_AT, 0L),
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

    /** created_at (ISO) du dernier message parent déjà notifié. null = aucun. */
    var messageWatermark: String?
        get() = prefs.getString(KEY_MSG_WM, null)
        set(value) { prefs.edit().putString(KEY_MSG_WM, value).apply() }

    /**
     * L'enfant/parent a-t-il ACTIVÉ le filtrage web (VpnService) ? Persisté pour
     * pouvoir RELANCER le filtrage après un redémarrage ou une mise à jour de l'app
     * (report L8a). Mis à true quand le tunnel s'établit, false sur arrêt explicite
     * ou révocation (on ne relance jamais un filtrage que l'utilisateur a coupé).
     */
    var filterDesired: Boolean
        get() = prefs.getBoolean(KEY_FILTER_DESIRED, false)
        set(value) { prefs.edit().putBoolean(KEY_FILTER_DESIRED, value).apply() }

    /**
     * Dernier réglage de localisation LU AVEC SUCCÈS (ligne JSON brute de
     * location_settings, ou "{}" si aucune ligne). Sert de repli hors ligne : on ne
     * retombe jamais sur un défaut plus permissif après une erreur réseau.
     */
    var lastLocationSettingsJson: String?
        get() = prefs.getString(KEY_LOC_SETTINGS, null)
        set(value) { prefs.edit().putString(KEY_LOC_SETTINGS, value).apply() }

    /** Pourquoi l'appareil a été désenrôlé (message affiché à l'écran d'appairage). */
    enum class UnenrollReason { SESSION_LOST, DEVICE_REVOKED }

    /** Identifiants de l'enrôlement courant (lecture en mémoire, sans déchiffrement). */
    data class Ids(val deviceId: String, val childId: String)

    companion object {
        @Volatile private var stateLoaded = false

        /**
         * Enrôlement COURANT (null = non enrôlé), tenu à jour par
         * [completeEnrollment] et [unenroll]. Observé par MainActivity (écran à
         * afficher, démarrage du service), lu sans déchiffrement par le VPN
         * (étiquetage du journal) et l'analyse bien-être (garde du child_id).
         */
        private val _current = MutableStateFlow<Ids?>(null)
        val current: StateFlow<Ids?> = _current.asStateFlow()

        /**
         * Dernier désenrôlement subi (null = aucun), PERSISTÉ jusqu'à ce que l'écran
         * d'appairage l'ait affiché ([acknowledgeUnenrolled]) ou un nouvel appairage.
         */
        private val _unenrolled = MutableStateFlow<UnenrollReason?>(null)
        val unenrolled: StateFlow<UnenrollReason?> = _unenrolled.asStateFlow()

        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_FAMILY_ID = "family_id"
        private const val KEY_CHILD_ID = "child_id"
        private const val KEY_MODE = "mode"
        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_CALL_WM = "call_log_watermark"
        private const val KEY_STATUS_TS = "pending_status_captured_at"
        private const val KEY_MSG_WM = "message_watermark"
        private const val KEY_LOC_SETTINGS = "last_location_settings"
        private const val KEY_FILTER_DESIRED = "filter_desired"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val KEY_OBTAINED_AT = "obtained_at"
        private const val KEY_PENDING_OBTAINED_AT = "pending_obtained_at"
        private const val KEY_PENDING_ACCESS = "pending_access_token"
        private const val KEY_PENDING_REFRESH = "pending_refresh_token"
        private const val KEY_PENDING_EXPIRES_AT = "pending_expires_at"
        private const val KEY_PENDING_USER_ID = "pending_user_id"
        private const val KEY_PAIRING_BLOCKED_UNTIL = "pairing_blocked_until"
        private const val KEY_UNENROLL_REASON = "unenroll_reason"
        private const val KEY_TEARDOWN_PENDING = "unenroll_teardown_pending"
    }
}
