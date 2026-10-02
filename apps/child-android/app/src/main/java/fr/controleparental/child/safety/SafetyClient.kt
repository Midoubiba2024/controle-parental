package fr.controleparental.child.safety

import fr.controleparental.child.data.SupabaseClient
import fr.controleparental.child.data.SupervisionStore
import org.json.JSONArray
import org.json.JSONObject

/**
 * LOT 6 — Couche d'accès Supabase pour le bien-être/sécurité ado (PostgREST, sous
 * la session de l'appareil enfant). Synchronise la CONFIG (consentement, profil,
 * pause), remonte les SIGNAUX de métadonnées, reporte l'ÉTAT de l'analyse, et gère
 * la pause de confidentialité (K8).
 *
 * 🔴 LIGNE ROUGE (docs/11-LOT6-BIEN-ETRE.md) : les charges utiles ne contiennent
 * QUE des métadonnées — catégorie, gravité, compteur, nom de paquet, horodatage.
 * JAMAIS le texte analysé, un extrait, ou un contenu de correspondance. Aucune
 * méthode de ce client n'accepte ni ne transporte de texte de notification.
 */
class SafetyClient(private val store: SupervisionStore) {

    private val client = SupabaseClient(store)

    /**
     * Synchronise la config d'analyse et la met en cache. Renvoie la [SafetyConfig]
     * à jour, ou null en cas d'échec réseau (l'appelant conserve alors le cache).
     * Lit : `safety_settings` (consentement, visibilité mutuelle), `children`
     * (profil d'âge — gradation : young_child ⇒ jamais d'analyse), et l'éventuelle
     * pause de confidentialité OUVERTE (`privacy_pauses`).
     */
    suspend fun syncSettings(cache: SafetyCache): SafetyConfig? {
        val e = store.load() ?: return null
        val cid = e.childId

        val settings = firstRow(client.get("safety_settings", "child_id=eq.$cid&select=analysis_enabled,mutual_visibility"))
        val childRow = firstRow(client.get("children", "id=eq.$cid&select=age_profile"))
        val openPause = rows(client.get("privacy_pauses", "child_id=eq.$cid&ended_at=is.null&select=id&limit=1"))
        // Si toutes les requêtes ont échoué (réseau), on ne touche pas au cache.
        if (settings == null && childRow == null && openPause == null) return null

        val profile = childRow?.optString("age_profile", "young_child") ?: "young_child"
        cache.teenProfile = profile == "preteen" || profile == "teen"
        // Absence de ligne settings = jamais configuré ⇒ désactivé (privacy by default).
        cache.analysisEnabled = settings?.optBoolean("analysis_enabled", false) ?: false
        cache.mutualVisibility = settings?.optBoolean("mutual_visibility", true) ?: true
        cache.pauseActive = (openPause?.length() ?: 0) > 0
        cache.lastSyncAt = System.currentTimeMillis()
        return cache.toConfig()
    }

    /**
     * Remonte des SIGNAUX de métadonnées (une ligne par signal). AUCUN contenu.
     * [sourceApp] est un nom de paquet/libellé (métadonnée d'origine).
     */
    suspend fun reportSignals(signals: List<SafetySignal>, sourceApp: String?): Boolean {
        if (signals.isEmpty()) return true
        val e = store.load() ?: return false
        val occurredAt = nowIso()
        val arr = JSONArray()
        for (s in signals) {
            val o = JSONObject()
                .put("family_id", e.familyId)
                .put("child_id", e.childId)
                .put("device_id", e.deviceId)
                .put("category", s.category.wire)
                .put("severity", s.severity.wire)
                .put("occurrence_count", s.matchCount)
                .put("occurred_at", occurredAt)
            if (!sourceApp.isNullOrBlank()) o.put("source_app", sourceApp.take(200))
            arr.put(o)
        }
        return client.upsert("safety_signals", arr) is SupabaseClient.Result.Ok
    }

    /** Reporte l'état de l'analyse (transparence : le parent voit on/off). */
    suspend fun reportStatus(active: Boolean): Boolean {
        val e = store.load() ?: return false
        val row = JSONObject()
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
            .put("analysis_active", active)
        if (active) row.put("last_active_at", nowIso()) else row.put("last_revoked_at", nowIso())
        return client.upsert("safety_status", JSONArray().put(row), onConflict = "device_id") is SupabaseClient.Result.Ok
    }

    /** K8 — L'ado ouvre une pause de confidentialité (NON silencieuse : le parent la voit). */
    suspend fun startPause(cache: SafetyCache): Boolean {
        val e = store.load() ?: return false
        val row = JSONObject()
            .put("family_id", e.familyId)
            .put("child_id", e.childId)
            .put("device_id", e.deviceId)
        val ok = client.upsert("privacy_pauses", JSONArray().put(row)) is SupabaseClient.Result.Ok
        if (ok) {
            cache.pauseActive = true
            reportStatus(false)
        }
        return ok
    }

    /** K8 — L'ado clôt sa pause (reprise de l'analyse). */
    suspend fun endPause(cache: SafetyCache): Boolean {
        val e = store.load() ?: return false
        val patch = JSONObject().put("ended_at", nowIso())
        val ok = client.patch("privacy_pauses", "device_id=eq.${e.deviceId}&ended_at=is.null", patch) is SupabaseClient.Result.Ok
        if (ok) {
            cache.pauseActive = false
            // Rétablit l'état d'analyse si consenti + profil ado.
            reportStatus(cache.toConfig().active)
        }
        return ok
    }

    // --- Helpers (même forme que FilterClient) ------------------------------
    private fun rows(res: SupabaseClient.GetResult): JSONArray? = when (res) {
        is SupabaseClient.GetResult.Ok -> runCatching { JSONArray(res.body) }.getOrDefault(JSONArray())
        is SupabaseClient.GetResult.Error -> null
    }

    private fun firstRow(res: SupabaseClient.GetResult): JSONObject? {
        val arr = rows(res) ?: return null
        return if (arr.length() > 0) arr.optJSONObject(0) else null
    }

    private fun nowIso(): String = java.time.Instant.now().toString()
}
