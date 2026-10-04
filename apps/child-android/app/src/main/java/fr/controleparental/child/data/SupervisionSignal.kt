package fr.controleparental.child.data

import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

/**
 * Signal de TRANSPARENCE vers le parent (LOT 12b) : « notifications coupées sur
 * l'appareil de l'enfant ». Depuis que toute collecte s'arrête sans notification
 * de supervision visible, le relevé device_status complet ne part plus dans ce
 * cas ; on envoie donc une ligne MINIMALE (identité + perm_notifications=false,
 * aucune autre mesure) dans le canal existant — la console affiche déjà la
 * bannière « protections désactivées : Notifications ». Aucune migration.
 * Au plus une fois par heure (processus).
 */
object SupervisionSignal {

    @Volatile private var lastSentMs = 0L
    private const val MIN_INTERVAL_MS = 60 * 60_000L

    suspend fun reportNotificationsOff(store: SupervisionStore) {
        val now = System.currentTimeMillis()
        if (now - lastSentMs < MIN_INTERVAL_MS) return
        val e = store.load() ?: return
        val row = JSONObject()
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
            .put("perm_notifications", false)
            .put("captured_at", Instant.ofEpochMilli(now).toString())
        val res = SupabaseClient(store).upsert(
            "device_status", JSONArray().put(row),
            onConflict = "device_id,captured_at", ignoreDuplicates = true,
        )
        if (res is SupabaseClient.Result.Ok) lastSentMs = now
    }
}
