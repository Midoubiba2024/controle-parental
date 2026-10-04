package fr.controleparental.child.location

import android.content.Context
import android.location.Location
import fr.controleparental.child.data.SupabaseClient
import fr.controleparental.child.data.SupervisionStore
import fr.controleparental.child.service.Unenrollment
import java.time.Instant
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

/**
 * LOT 3 — Accès Supabase (PostgREST) pour la localisation & la sécurité, sous la
 * session de l'appareil enfant (RLS : écrit SES lignes, lit SES zones/réglages).
 *
 * MINIMISATION : les coordonnées sont ARRONDIES à 5 décimales (~1 m) avant envoi
 * (précision bornée) ; on ne transmet ni vitesse, ni cap. La rétention est bornée
 * côté base (purge L8) selon location_settings.retention_days.
 */
class LocationRepository(private val store: SupervisionStore) {

    private val client = SupabaseClient(store)

    data class Settings(
        val enabled: Boolean,
        val mode: String,                 // off | on_demand | periodic
        val periodicIntervalSec: Int,
        val retentionDays: Int,
        val highAccuracy: Boolean,
        // Alertes d'entrée/sortie de zones : réglage SÉPARÉ du partage de position.
        val geofenceAlertsEnabled: Boolean = true,
    ) {
        companion object {
            val DEFAULT = Settings(true, "on_demand", 900, 30, false, true)
        }
    }

    data class Geofence(
        val id: String, val name: String, val type: String,
        val lat: Double, val lng: Double, val radiusM: Float,
        val notifyEnter: Boolean, val notifyExit: Boolean,
    )

    /**
     * Réglage de partage de l'enfant.
     *  - lecture réussie : le réglage (DEFAULT si aucune ligne), MÉMORISÉ ;
     *  - erreur (réseau, réponse illisible) : le dernier réglage lu avec succès ;
     *  - rien de connu : null. L'appelant ÉCHOUE ALORS FERMÉ (aucune zone
     *    enregistrée) et « mes données » affiche un texte prudent.
     */
    suspend fun settings(): Settings? = fetchSettings() ?: cachedSettings()

    /** Dernier réglage lu avec succès (sans réseau), ou null. */
    fun cachedSettings(): Settings? =
        store.lastLocationSettingsJson?.let { json -> runCatching { parseSettings(JSONObject(json)) }.getOrNull() }

    private suspend fun fetchSettings(): Settings? {
        val e = store.load() ?: return null
        val deviceId = e.deviceId
        val res = client.get("location_settings",
            // select=* : tolère une base où la colonne geofence_alerts_enabled n'existe
            // pas encore (migration 0030) — elle vaut alors true, comme avant.
            "child_id=eq.${e.childId}&select=*")
        val body = (res as? SupabaseClient.GetResult.Ok)?.body ?: return null
        val arr = runCatching { JSONArray(body) }.getOrNull() ?: return null
        val row = (if (arr.length() > 0) arr.optJSONObject(0) else null) ?: JSONObject()
        // Jamais écrit après (ou pendant) un démontage : sinon hérité par l'appairage suivant.
        Unenrollment.ifStillEnrolled(deviceId) { store.lastLocationSettingsJson = row.toString() }
        return parseSettings(row)
    }

    /** Ligne location_settings → Settings ("{}" = aucune ligne → valeurs par défaut). */
    private fun parseSettings(o: JSONObject): Settings = Settings(
        enabled = o.optBoolean("enabled", Settings.DEFAULT.enabled),
        mode = o.optString("mode", Settings.DEFAULT.mode),
        periodicIntervalSec = o.optInt("periodic_interval_sec", Settings.DEFAULT.periodicIntervalSec),
        retentionDays = o.optInt("retention_days", Settings.DEFAULT.retentionDays),
        highAccuracy = o.optBoolean("high_accuracy", Settings.DEFAULT.highAccuracy),
        geofenceAlertsEnabled = o.optBoolean("geofence_alerts_enabled", Settings.DEFAULT.geofenceAlertsEnabled),
    )

    /** Zones ACTIVES de l'enfant (à (ré)enregistrer dans GeofencingClient). */
    suspend fun geofences(): List<Geofence> = geofencesOrNull() ?: emptyList()

    /** Comme [geofences], mais null en cas d'erreur (pour ne pas confondre « aucune
     *  zone » et « réseau indisponible »). */
    suspend fun geofencesOrNull(): List<Geofence>? {
        val e = store.load() ?: return null
        val res = client.get("geofences",
            "child_id=eq.${e.childId}&enabled=is.true&select=id,name,type,center_lat,center_lng,radius_m,notify_enter,notify_exit")
        val arr = asArray(res) ?: return null
        val out = mutableListOf<Geofence>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out += Geofence(
                id = o.optString("id"),
                name = o.optString("name"),
                type = o.optString("type", "custom"),
                lat = o.optDouble("center_lat"),
                lng = o.optDouble("center_lng"),
                radiusM = o.optDouble("radius_m", 150.0).toFloat(),
                notifyEnter = o.optBoolean("notify_enter", true),
                notifyExit = o.optBoolean("notify_exit", false),
            )
        }
        return out
    }

    /** Épisode SOS en cours (active|acked) pour cet enfant, ou null. */
    suspend fun activeSos(): JSONObject? {
        val e = store.load() ?: return null
        val res = client.get("sos_events",
            "child_id=eq.${e.childId}&status=in.(active,acked)&select=id,status,started_at&order=started_at.desc&limit=1")
        val arr = asArray(res) ?: return null
        return if (arr.length() > 0) arr.optJSONObject(0) else null
    }

    /** Insère un relevé de position (idempotent sur device_id+captured_at). */
    suspend fun insertFix(loc: Location, source: String, batteryLevel: Int?, capturedAtMs: Long = loc.time.takeIf { it > 0 } ?: System.currentTimeMillis()): Boolean {
        val e = store.load() ?: return false
        // Minimisation (LOT 12b) : jamais une position antérieure à l'appairage
        // (repli lastLocation du cache système sans limite d'âge).
        if (capturedAtMs < store.enrolledAt) return false
        val row = JSONObject()
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
            .put("latitude", round5(loc.latitude))
            .put("longitude", round5(loc.longitude))
            .put("accuracy_m", if (loc.hasAccuracy()) loc.accuracy else JSONObject.NULL)
            .put("source", source)
            .put("captured_at", iso(capturedAtMs))
        if (batteryLevel != null) row.put("battery_level", batteryLevel)
        return client.upsert(
            "location_fixes", JSONArray().put(row),
            onConflict = "device_id,captured_at", ignoreDuplicates = true,
        ) is SupabaseClient.Result.Ok
    }

    /**
     * Déclenche un SOS (déclenché par l'enfant → transparent). L'identifiant est
     * généré ICI et mémorisé avec l'instant de déclenchement (temps écoulé) : seul
     * ce SOS local pourra être diffusé en direct (T1 — une ligne rouverte côté
     * serveur ne déclenche jamais de suivi).
     */
    suspend fun startSos(context: Context, message: String?): Boolean {
        val e = store.load() ?: return false
        val id = UUID.randomUUID().toString()
        val boot = BootClock.bootCount(context)
        val startedElapsed = BootClock.elapsedMs()
        val row = JSONObject()
            .put("id", id)
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
            .put("status", "active")
        if (!message.isNullOrBlank()) row.put("message", message)
        val ok = client.upsert("sos_events", JSONArray().put(row)) is SupabaseClient.Result.Ok
        if (ok) {
            Unenrollment.ifStillEnrolled(e.deviceId) {
                store.localSos = SupervisionStore.LocalSos(id, boot, startedElapsed)
            }
        }
        return ok
    }

    /** L'enfant clôt son propre SOS (status → resolved). */
    suspend fun resolveSos(id: String): Boolean {
        val patch = JSONObject().put("status", "resolved").put("ended_at", iso(System.currentTimeMillis()))
        return client.patch("sos_events", "id=eq.$id", patch) is SupabaseClient.Result.Ok
    }

    /** Enregistre une transition de geofence (ENTER/EXIT/DWELL). */
    suspend fun insertGeofenceEvent(geofenceId: String?, name: String?, transition: String): Boolean {
        val e = store.load() ?: return false
        val row = JSONObject()
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
            .put("transition", transition)
            .put("occurred_at", iso(System.currentTimeMillis()))
        if (geofenceId != null) row.put("geofence_id", geofenceId)
        if (name != null) row.put("geofence_name", name)
        return client.upsert("geofence_events", JSONArray().put(row)) is SupabaseClient.Result.Ok
    }

    /** Alerte de sécurité (batterie faible) — D7. */
    suspend fun insertSafetyAlert(kind: String, batteryLevel: Int?): Boolean {
        val e = store.load() ?: return false
        val row = JSONObject()
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
            .put("kind", kind)
        if (batteryLevel != null) row.put("battery_level", batteryLevel)
        return client.upsert("safety_alerts", JSONArray().put(row)) is SupabaseClient.Result.Ok
    }

    // --- Helpers ------------------------------------------------------------
    private fun asArray(res: SupabaseClient.GetResult): JSONArray? = when (res) {
        is SupabaseClient.GetResult.Ok -> try { JSONArray(res.body) } catch (_: Exception) { JSONArray() }
        is SupabaseClient.GetResult.Error -> null
    }

    private fun round5(v: Double): Double = Math.round(v * 1e5) / 1e5

    private fun iso(epochMs: Long): String = Instant.ofEpochMilli(epochMs).toString()
}
