import { useState, type ReactNode } from "react";
import { errorMessage, Trans, useI18n } from "../../i18n";
import { supabase } from "../../lib/supabase";
import type { Child, Family } from "../../lib/types";
import { Download, Trash2 } from "lucide-react";
import { ic } from "../icons";

/* =============================================================================
   LOT 8b — K10 : Confidentialité & RGPD. Droit d'accès (export JSON) et droit à
   l'effacement (suppression enfant / famille) à DOUBLE CONFIRMATION explicite.
   + rappel transparent de la politique de rétention (K9, docs/12-RETENTION-RGPD.md).

   Les RPC sous-jacentes (export_child_data / rgpd_delete_child / rgpd_delete_family)
   s'exécutent sous la RLS de l'appelant et contrôlent l'autorité parentale : un
   parent ne peut agir que sur SA famille. L'opération est tracée dans l'audit (K3).
   ============================================================================= */

// Durées de conservation par type (miroir de app.run_data_retention / docs/12).
// Libellés : views.privacy.retention.rows.<key>. `days` null = réglable par enfant.
const RETENTION: { key: RetentionKey; days: number | null }[] = [
  { key: "locations", days: null },
  { key: "domainLog", days: null },
  { key: "deviceState", days: 30 },
  { key: "callSmsMetadata", days: 90 },
  { key: "zoneTransitions", days: 90 },
  { key: "safetySignals", days: 90 },
  { key: "alerts", days: 90 },
  { key: "screenTime", days: 180 },
  { key: "timeBonuses", days: 180 },
  { key: "commands", days: 30 },
  { key: "messaging", days: 365 },
  { key: "sosEpisodes", days: 365 },
  { key: "auditLog", days: 730 },
];
type RetentionKey =
  | "locations" | "domainLog" | "deviceState" | "callSmsMetadata" | "zoneTransitions"
  | "safetySignals" | "alerts" | "screenTime" | "timeBonuses" | "commands"
  | "messaging" | "sosEpisodes" | "auditLog";

/** Balise <muted> des titres de carte : précision entre parenthèses, atténuée. */
const MUTED_TAG = { muted: (c: ReactNode) => <span className="muted small">{c}</span> };
const B_TAG = { b: (c: ReactNode) => <b>{c}</b> };

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
    <div className="stack" style={{ gap: 20 }}>
      <ExportCard key={`exp-${child.id}`} child={child} />
      <RetentionCard />
      <DeleteChildCard key={`del-${child.id}`} child={child} onChanged={onChanged} />
      <DeleteFamilyCard key={`delfam-${family.id}`} family={family} onChanged={onChanged} />
    </div>
  );
}

/* ------------------------------ Export (droit d'accès) ------------------ */
function ExportCard({ child }: { child: Child }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function exportJson() {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("export_child_data", { p_child_id: child.id });
    setBusy(false);
    if (error) { setMsg(errorMessage(error)); return; }
    // Téléchargement côté navigateur (aucune donnée ne transite ailleurs).
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `export-${slug(child.display_name)}-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    setMsg(t("views.privacy.export.done"));
  }

  return (
    <div className="card">
      <h2><Trans k="views.privacy.export.title" params={{ name: child.display_name }} tags={MUTED_TAG} /></h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        {t("views.privacy.export.intro")}
      </p>
      <button disabled={busy} onClick={exportJson}><Download {...ic} size={18} />{busy ? t("views.privacy.export.preparing") : t("views.privacy.export.button")}</button>
      {msg && <p className="msg" style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  );
}

/* ------------------------------ Politique de rétention ------------------ */
function RetentionCard() {
  const { t } = useI18n();
  return (
    <div className="card">
      <h2><Trans k="views.privacy.retention.title" tags={MUTED_TAG} /></h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        <Trans k="views.privacy.retention.intro" tags={{ code: (c) => <code>{c}</code> }} />
      </p>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>{t("views.privacy.retention.colData")}</th><th>{t("views.privacy.retention.colRetention")}</th></tr></thead>
        <tbody>
          {RETENTION.map((r) => (
            <tr key={r.key}>
              <td className="wrap">{t(`views.privacy.retention.rows.${r.key}`)}</td>
              <td className="muted">
                {r.days == null
                  ? t("views.privacy.retention.perChildDefault", { days: 30 })
                  : t("views.privacy.retention.days", { days: r.days })}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

/* ------------------------------ Suppression enfant ---------------------- */
function DeleteChildCard({ child, onChanged }: { child: Child; onChanged: () => void }) {
  const { t } = useI18n();
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
    if (error) { setErr(errorMessage(error)); return; }
    setStep(0); setConfirmText("");
    onChanged();
  }

  return (
    <div className="card danger-zone">
      <h2><Trans k="views.privacy.deleteChild.title" params={{ name: child.display_name }} tags={MUTED_TAG} /></h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        <Trans k="views.privacy.deleteChild.intro" tags={B_TAG} />
      </p>
      {step === 0 ? (
        <button className="btn-danger" onClick={() => { setStep(1); setErr(null); }}>
          <Trash2 {...ic} size={18} />{t("views.privacy.deleteChild.button")}
        </button>
      ) : (
        <div className="confirm-box">
          <p className="small" style={{ marginTop: 0 }}>
            <Trans k="views.privacy.deleteChild.confirmPrompt" params={{ name: child.display_name }} tags={B_TAG} />
          </p>
          <input aria-label={child.display_name} value={confirmText} placeholder={child.display_name}
            onChange={(e) => setConfirmText(e.target.value)} />
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn-danger" disabled={!canConfirm || busy} onClick={doDelete}>
              {busy ? t("views.privacy.deleting") : t("views.privacy.deleteChild.confirmButton")}
            </button>
            <button className="ghost" disabled={busy} onClick={() => { setStep(0); setConfirmText(""); setErr(null); }}>
              {t("views.privacy.cancel")}
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
  const { t } = useI18n();
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
    if (error) { setErr(errorMessage(error)); return; }
    setStep(0); setConfirmText("");
    onChanged();
  }

  return (
    <div className="card danger-zone">
      <h2><Trans k="views.privacy.deleteFamily.title" params={{ name: family.name }} tags={MUTED_TAG} /></h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        <Trans k="views.privacy.deleteFamily.intro" tags={B_TAG} />
      </p>
      {step === 0 ? (
        <button className="btn-danger" onClick={() => { setStep(1); setErr(null); }}>
          <Trash2 {...ic} size={18} />{t("views.privacy.deleteFamily.button")}
        </button>
      ) : (
        <div className="confirm-box">
          <p className="small" style={{ marginTop: 0 }}>
            <Trans k="views.privacy.deleteFamily.confirmPrompt" params={{ name: family.name }} tags={B_TAG} />
          </p>
          <input aria-label={family.name} value={confirmText} placeholder={family.name}
            onChange={(e) => setConfirmText(e.target.value)} />
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn-danger" disabled={!canConfirm || busy} onClick={doDelete}>
              {busy ? t("views.privacy.deleting") : t("views.privacy.deleteFamily.confirmButton")}
            </button>
            <button className="ghost" disabled={busy} onClick={() => { setStep(0); setConfirmText(""); setErr(null); }}>
              {t("views.privacy.cancel")}
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
