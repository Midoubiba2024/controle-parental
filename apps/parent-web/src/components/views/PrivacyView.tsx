import { useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Child, Family } from "../../lib/types";

/* =============================================================================
   LOT 8b — K10 : Confidentialité & RGPD. Droit d'accès (export JSON) et droit à
   l'effacement (suppression enfant / famille) à DOUBLE CONFIRMATION explicite.
   + rappel transparent de la politique de rétention (K9, docs/12-RETENTION-RGPD.md).

   Les RPC sous-jacentes (export_child_data / rgpd_delete_child / rgpd_delete_family)
   s'exécutent sous la RLS de l'appelant et contrôlent l'autorité parentale : un
   parent ne peut agir que sur SA famille. L'opération est tracée dans l'audit (K3).
   ============================================================================= */

// Durées de conservation par type (miroir de app.run_data_retention / docs/12).
const RETENTION: { label: string; days: string }[] = [
  { label: "Positions (localisation)", days: "réglable par enfant — défaut 30 j" },
  { label: "Journal des domaines (filtrage)", days: "réglable par enfant — défaut 30 j" },
  { label: "État de l'appareil (batterie/stockage)", days: "30 j" },
  { label: "Métadonnées d'appels/SMS", days: "90 j" },
  { label: "Transitions de zones", days: "90 j" },
  { label: "Signaux de sécurité (ado, on-device)", days: "90 j" },
  { label: "Alertes (batterie faible…)", days: "90 j" },
  { label: "Temps d'écran (agrégats quotidiens)", days: "180 j" },
  { label: "Bonus de temps accordés", days: "180 j" },
  { label: "Commandes", days: "30 j" },
  { label: "Messagerie interne", days: "365 j" },
  { label: "Épisodes SOS", days: "365 j" },
  { label: "Journal d'audit (traçabilité)", days: "730 j" },
];

export function PrivacyView({ family, child, onChanged }: {
  family: Family;
  child: Child;
  onChanged: () => void;
}) {
  // `key` sur la cible : force le REMONTAGE des cartes (donc la réinitialisation de
  // leur état local step/confirmText) dès que l'enfant ou la famille change via le
  // sélecteur. Sans ça, une confirmation ouverte+pré-remplie pour l'enfant A resterait
  // active après bascule sur l'enfant B et supprimerait la MAUVAISE cible (prénoms non
  // uniques) — footgun irréversible.
  return (
    <div className="grid" style={{ gap: 18 }}>
      <ExportCard key={`exp-${child.id}`} child={child} />
      <RetentionCard />
      <DeleteChildCard key={`del-${child.id}`} child={child} onChanged={onChanged} />
      <DeleteFamilyCard key={`delfam-${family.id}`} family={family} onChanged={onChanged} />
    </div>
  );
}

/* ------------------------------ Export (droit d'accès) ------------------ */
function ExportCard({ child }: { child: Child }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function exportJson() {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("export_child_data", { p_child_id: child.id });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    // Téléchargement côté navigateur (aucune donnée ne transite ailleurs).
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `export-${slug(child.display_name)}-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    setMsg("Export téléchargé.");
  }

  return (
    <div className="card">
      <h2>Exporter les données de {child.display_name} <span className="muted small">(droit d'accès)</span></h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Télécharge au format JSON toutes les données enregistrées pour cet enfant
        (métadonnées et agrégats — jamais le contenu de tiers). L'export est journalisé
        dans l'audit, visible de l'enfant.
      </p>
      <button disabled={busy} onClick={exportJson}>{busy ? "Préparation…" : "⬇ Télécharger l'export JSON"}</button>
      {msg && <p className="msg" style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  );
}

/* ------------------------------ Politique de rétention ------------------ */
function RetentionCard() {
  return (
    <div className="card">
      <h2>Conservation des données <span className="muted small">(purge automatique)</span></h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Les données anciennes sont supprimées automatiquement selon leur type
        (minimisation RGPD). Détail et justification : <code>docs/12-RETENTION-RGPD.md</code>.
      </p>
      <table className="tbl">
        <thead><tr><th>Donnée</th><th>Conservation</th></tr></thead>
        <tbody>
          {RETENTION.map((r) => (
            <tr key={r.label}><td>{r.label}</td><td className="muted">{r.days}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ Suppression enfant ---------------------- */
function DeleteChildCard({ child, onChanged }: { child: Child; onChanged: () => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canConfirm = confirmText.trim() === child.display_name;

  async function doDelete() {
    if (!canConfirm) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("rgpd_delete_child", { p_child_id: child.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStep(0); setConfirmText("");
    onChanged();
  }

  return (
    <div className="card danger-zone">
      <h2>Supprimer les données de {child.display_name} <span className="muted small">(droit à l'effacement)</span></h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Efface <b>définitivement</b> cet enfant et toutes ses données (positions,
        temps d'écran, messages, signaux…). Les autres membres de la famille ne sont
        pas affectés. <b>Action irréversible.</b>
      </p>
      {step === 0 ? (
        <button className="btn-danger" onClick={() => { setStep(1); setErr(null); }}>
          Supprimer cet enfant…
        </button>
      ) : (
        <div className="confirm-box">
          <p className="small" style={{ marginTop: 0 }}>
            Confirmation : saisissez le prénom <b>{child.display_name}</b> pour confirmer.
          </p>
          <input value={confirmText} placeholder={child.display_name}
            onChange={(e) => setConfirmText(e.target.value)} />
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn-danger" disabled={!canConfirm || busy} onClick={doDelete}>
              {busy ? "Suppression…" : "Confirmer la suppression définitive"}
            </button>
            <button className="ghost" disabled={busy} onClick={() => { setStep(0); setConfirmText(""); setErr(null); }}>
              Annuler
            </button>
          </div>
        </div>
      )}
      {err && <p className="msg error" style={{ marginTop: 10 }}>{err}</p>}
    </div>
  );
}

/* ------------------------------ Suppression famille --------------------- */
function DeleteFamilyCard({ family, onChanged }: { family: Family; onChanged: () => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canConfirm = confirmText.trim() === family.name;

  async function doDelete() {
    if (!canConfirm) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("rgpd_delete_family", { p_family_id: family.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStep(0); setConfirmText("");
    onChanged();
  }

  return (
    <div className="card danger-zone">
      <h2>Supprimer toute la famille « {family.name} » <span className="muted small">(réservé au propriétaire)</span></h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Efface <b>définitivement</b> la famille entière : tous les enfants, appareils,
        règles et données. Seul le <b>propriétaire</b> du foyer peut le faire.
        <b> Action irréversible.</b>
      </p>
      {step === 0 ? (
        <button className="btn-danger" onClick={() => { setStep(1); setErr(null); }}>
          Supprimer toute la famille…
        </button>
      ) : (
        <div className="confirm-box">
          <p className="small" style={{ marginTop: 0 }}>
            Confirmation : saisissez le nom du foyer <b>{family.name}</b> pour confirmer.
          </p>
          <input value={confirmText} placeholder={family.name}
            onChange={(e) => setConfirmText(e.target.value)} />
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn-danger" disabled={!canConfirm || busy} onClick={doDelete}>
              {busy ? "Suppression…" : "Confirmer la suppression de la famille"}
            </button>
            <button className="ghost" disabled={busy} onClick={() => { setStep(0); setConfirmText(""); setErr(null); }}>
              Annuler
            </button>
          </div>
        </div>
      )}
      {err && <p className="msg error" style={{ marginTop: 10 }}>{err}</p>}
    </div>
  );
}

function slug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().replace(/^-+|-+$/g, "") || "enfant";
}
