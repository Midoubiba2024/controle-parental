package fr.controleparental.child.safety

import fr.controleparental.child.data.SupabaseClient
import fr.controleparental.child.data.SupervisionStore
import org.json.JSONArray
import org.json.JSONObject

/**
 * LOT 6 — Couche d'accès Supabase pour le bien-être/sécurité ado (PostgREST, sous
 * la session de l'appareil enfant). Synchronise la CONFIG (consentement, profil,
 * pause), remonte les SIGNAUX de métadonnées, reporte l'ÉTAT de l'analyse, gère la
 * pause de confidentialité (K8), et lit les propres signaux de l'ado (visibilité
 * mutuelle K6).
 *
 * 🔴 LIGNE ROUGE (docs/11-LOT6-BIEN-ETRE.md) : les charges utiles ne contiennent
 * QUE des métadonnées — catégorie, gravité, app source, compteur, heure. JAMAIS le
 * texte analysé, un extrait, ou un contenu. Aucune méthode de ce client n'accepte
 * ni ne transporte de texte de notification.
 */
class SafetyClient(private val store: SupervisionStore) {

    private val client = SupabaseClient(store)

    /**
     * Synchronise la config d'analyse et la met en cache. Renvoie la [SafetyConfig]
     * à jour, ou null si TOUTES les requêtes échouent (réseau) — l'appelant conserve
     * alors le cache.
     *
     * 🔒 Robustesse (retour de revue #1) : chaque champ du cache n'est mis à jour
     * QUE si SA requête a réussi. En cas d'échec PARTIEL (ex. seule `privacy_pauses`
     * échoue), on CONSERVE la valeur précédente de `pauseActive` — défaut protecteur
     * K8 : ne jamais relancer l'analyse pendant une pause qu'on n'a pas pu confirmer
     * close. `lastSyncAt` (qui lève `neverSynced`) n'avance que si les GARDES
     * (consentement + profil) sont connues de façon fiable.
     */
    suspend fun syncSettings(cache: SafetyCache): SafetyConfig? {
        val e = store.load() ?: return null
        val cid = e.childId

        val settingsRes = client.get("safety_settings", "child_id=eq.$cid&select=analysis_enabled,mutual_visibility")
        val childRes = client.get("children", "id=eq.$cid&select=age_profile")
        val pauseRes = client.get("privacy_pauses", "child_id=eq.$cid&ended_at=is.null&select=id&limit=1")

        val settingsOk = settingsRes is SupabaseClient.GetResult.Ok
        val childOk = childRes is SupabaseClient.GetResult.Ok
        val pauseOk = pauseRes is SupabaseClient.GetResult.Ok
        if (!settingsOk && !childOk && !pauseOk) return null

        if (settingsRes is SupabaseClient.GetResult.Ok) {
            // Absence de ligne = jamais configuré ⇒ défauts (analyse OFF — privacy by default).
            val row = firstOf(settingsRes.body)
            cache.analysisEnabled = row?.optBoolean("analysis_enabled", false) ?: false
            cache.mutualVisibility = row?.optBoolean("mutual_visibility", true) ?: true
        }
        if (childRes is SupabaseClient.GetResult.Ok) {
            val profile = firstOf(childRes.body)?.optString("age_profile", "young_child") ?: "young_child"
            cache.teenProfile = profile == "preteen" || profile == "teen"
        }
        if (pauseRes is SupabaseClient.GetResult.Ok) {
            cache.pauseActive = bodyArray(pauseRes.body).length() > 0
        }
        // "Synchronisé" (neverSynced=false) seulement si les gardes sont connues.
        if (settingsOk && childOk) cache.lastSyncAt = System.currentTimeMillis()
        return cache.toConfig()
    }

    /**
     * Visibilité mutuelle (K6) : les propres signaux de l'ado (métadonnées), pour
     * affichage lecture seule dans « mes données ». Catégorie + gravité + heure —
     * jamais de contenu (il n'existe pas en base).
     */
    suspend fun fetchMySignals(limit: Int = 20): List<MySignal> {
        val e = store.load() ?: return emptyList()
        val res = client.get(
            "safety_signals",
            "child_id=eq.${e.childId}&select=category,severity,occurred_at&order=occurred_at.desc&limit=$limit",
        )
        val arr = (res as? SupabaseClient.GetResult.Ok)?.let { bodyArray(it.body) } ?: return emptyList()
        val out = ArrayList<MySignal>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(MySignal(o.optString("category"), o.optString("severity"), o.optString("occurred_at")))
        }
        return out
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

    /** Signal de l'ado (métadonnées seulement) pour la visibilité mutuelle. */
    data class MySignal(val category: String, val severity: String, val occurredAtIso: String)

    // --- Helpers ------------------------------------------------------------
    private fun bodyArray(body: String): JSONArray = runCatching { JSONArray(body) }.getOrDefault(JSONArray())

    private fun firstOf(body: String): JSONObject? {
        val a = bodyArray(body)
        return if (a.length() > 0) a.optJSONObject(0) else null
    }

    private fun nowIso(): String = java.time.Instant.now().toString()
}
