package fr.controleparental.child.location

import android.location.Location
import fr.controleparental.child.data.SupabaseClient
import fr.controleparental.child.data.SupervisionStore
import java.time.Instant
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
    ) {
        companion object {
            val DEFAULT = Settings(true, "on_demand", 900, 30, false)
        }
    }

    data class Geofence(
        val id: String, val name: String, val type: String,
        val lat: Double, val lng: Double, val radiusM: Float,
        val notifyEnter: Boolean, val notifyExit: Boolean,
    )

    /** Réglage de partage de l'enfant (ou défaut si absent / erreur réseau). */
    suspend fun settings(): Settings {
        val e = store.load() ?: return Settings.DEFAULT
        val res = client.get("location_settings",
            "child_id=eq.${e.childId}&select=enabled,mode,periodic_interval_sec,retention_days,high_accuracy")
        val arr = asArray(res) ?: return Settings.DEFAULT
        val o = (if (arr.length() > 0) arr.optJSONObject(0) else null) ?: return Settings.DEFAULT
        return Settings(
            enabled = o.optBoolean("enabled", true),
            mode = o.optString("mode", "on_demand"),
            periodicIntervalSec = o.optInt("periodic_interval_sec", 900),
            retentionDays = o.optInt("retention_days", 30),
            highAccuracy = o.optBoolean("high_accuracy", false),
        )
    }

    /** Zones ACTIVES de l'enfant (à (ré)enregistrer dans GeofencingClient). */
    suspend fun geofences(): List<Geofence> {
        val e = store.load() ?: return emptyList()
        val res = client.get("geofences",
            "child_id=eq.${e.childId}&enabled=is.true&select=id,name,type,center_lat,center_lng,radius_m,notify_enter,notify_exit")
        val arr = asArray(res) ?: return emptyList()
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

    /** Déclenche un SOS (déclenché par l'enfant → transparent). */
    suspend fun startSos(message: String?): Boolean {
        val e = store.load() ?: return false
        val row = JSONObject()
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
            .put("status", "active")
        if (!message.isNullOrBlank()) row.put("message", message)
        return client.upsert("sos_events", JSONArray().put(row)) is SupabaseClient.Result.Ok
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
