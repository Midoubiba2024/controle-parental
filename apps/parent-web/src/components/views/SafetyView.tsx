import { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  HELP_RESOURCES, SAFETY_CATEGORIES, SEVERITY_LABEL, SEVERITY_ORDER,
  safetyCategoryColor, safetyCategoryLabel, severityColor, toSafetySettingsUpsert, useSafety,
} from "../../lib/safety";
import { fmtAgo, fmtDateTime } from "../../lib/format";
import { EmptyState } from "../Ui";
import type { Child, SafetyCategory, SafetySettings } from "../../lib/types";

/* =============================================================================
   LOT 6 — Sécurité ado : tableau par CATÉGORIES (G6) + réglages « mode ado »
   (K6) + pause de confidentialité non silencieuse (K8) + ressources d'aide.

   🔴 LIGNE ROUGE (docs/11-LOT6-BIEN-ETRE.md) : la détection a lieu SUR L'APPAREIL ;
   cette vue n'affiche QUE des métadonnées (catégorie, gravité, app source,
   compteur, heure). JAMAIS le texte déclencheur. La pause (K8) est visible en tant
   que pause — jamais son contenu.
   ============================================================================= */

const STALE_MS = 5 * 60_000;

export function SafetyView({ familyId, child }: { familyId: string; child: Child }) {
  const s = useSafety(familyId, child.id);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (s.loading) return <p className="muted">Chargement de la sécurité ado…</p>;

  // Gradation par âge : fonction RÉSERVÉE au profil ado (preteen/teen). Pour
  // young_child, elle est totalement OFF (ni service, ni analyse) → on ne propose rien.
  if (child.age_profile === "young_child") return <YoungChildNotice child={child} />;

  async function run(fn: () => Promise<{ error?: string | null } | void>) {
    setBusy(true); setMsg(null);
    const res = await fn();
    setBusy(false);
    if (res && res.error) setMsg(res.error);
    else s.reload();
  }

  async function saveSettings(patch: Partial<SafetySettings>) {
    const base = toSafetySettingsUpsert(s.settings, familyId, child.id);
    const { error } = await supabase.from("safety_settings")
      .upsert({ ...base, ...patch }, { onConflict: "child_id" });
    return { error: error?.message ?? null };
  }

  async function acknowledge(id: string) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("safety_signals")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: auth.user?.id ?? null })
      .eq("id", id);
    return { error: error?.message ?? null };
  }

  return (
    <div className="grid dash" style={{ gap: 18 }}>
      {s.error && <p className="msg error" style={{ gridColumn: "1 / -1" }}>{s.error}</p>}
      {msg && <p className="msg error" style={{ gridColumn: "1 / -1" }}>{msg}</p>}

      <SettingsCard s={s} child={child} busy={busy} run={run} saveSettings={saveSettings} />
      <CategoriesCard s={s} />
      <SignalsCard s={s} busy={busy} run={run} acknowledge={acknowledge} />
      <ResourcesCard />
    </div>
  );
}

type RunFn = (fn: () => Promise<{ error?: string | null } | void>) => void;
type SafetyHook = ReturnType<typeof useSafety>;

/* ------------------------- Notice profil jeune enfant -------------------- */
function YoungChildNotice({ child }: { child: Child }) {
  return (
    <div className="card">
      <h2>Sécurité ado — non applicable</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        L'analyse de bien-être sur l'appareil est <b>réservée au profil ado</b> (pré-ado / ado).
      </p>
      <p>
        Pour <b>{child.display_name}</b> (profil jeune enfant), cette fonction est
        <b> totalement désactivée</b> : aucun service d'analyse n'est actif et aucune permission
        n'est demandée. La protection passe par le <b>filtrage</b>, les <b>limites de temps</b> et la
        <b> localisation transparente</b>. Elle pourra être proposée, de façon transparente et
        co-consentie, lorsque l'enfant grandira (gradation par âge — CNIL/RGPD art. 8).
      </p>
    </div>
  );
}

/* ------------------------- Réglages « mode ado » (K6) + état + pause (K8) - */
function SettingsCard({ s, child, busy, run, saveSettings }: {
  s: SafetyHook; child: Child; busy: boolean; run: RunFn;
  saveSettings: (p: Partial<SafetySettings>) => Promise<{ error: string | null }>;
}) {
  const enabled = s.settings?.analysis_enabled ?? false;
  const mutual = s.settings?.mutual_visibility ?? true;

  return (
    <div className="card">
      <h2>Analyse de bien-être (sur l'appareil)</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        Le texte des notifications est analysé <b>sur le téléphone de {child.display_name}</b>. Vous ne
        recevez qu'une <b>alerte de catégorie</b> (ci-dessous) — <b>jamais</b> ses messages, jamais le
        texte. L'ado le voit dans « mes données » et peut la désactiver ou la mettre en pause.
      </p>

      <label className="row" style={{ gap: 8, marginTop: 8 }}>
        <input type="checkbox" checked={enabled} disabled={busy}
          onChange={(e) => run(() => saveSettings({ analysis_enabled: e.target.checked }))} />
        <span><b>Activer l'analyse</b> (nécessite le co-consentement de l'ado)</span>
      </label>
      <p className="muted small" style={{ marginTop: -2 }}>
        Désactivée par défaut (privacy by default). L'analyse ne tourne que si l'ado accorde aussi
        l'accès aux notifications sur son appareil.
      </p>

      <label className="row" style={{ gap: 8, marginTop: 10 }}>
        <input type="checkbox" checked={mutual} disabled={busy}
          onChange={(e) => run(() => saveSettings({ mutual_visibility: e.target.checked }))} />
        <span><b>Visibilité mutuelle</b> (mode ado, K6) — l'ado voit ce que vous voyez</span>
      </label>

      {s.openPauses.length > 0 && (
        <div className="msg" style={{ marginTop: 14, borderLeft: "3px solid var(--warning)", paddingLeft: 10 }}>
          <b>⏸ Pause de confidentialité active.</b> {child.display_name} a suspendu l'analyse
          {s.openPauses[0].started_at ? ` (depuis ${fmtAgo(s.openPauses[0].started_at)})` : ""}. Vous voyez
          qu'une pause est en cours — <b>jamais</b> ce qu'elle masque (K8). C'est à l'ado de la lever.
        </div>
      )}

      <h3 style={{ marginTop: 18 }}>État de l'analyse</h3>
      {s.status.length === 0 ? (
        <p className="muted small">
          Aucun appareil n'a encore signalé l'état de l'analyse. Il apparaîtra ici une fois l'accès
          aux notifications accordé sur l'appareil de l'ado.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {s.status.map((st) => {
            const stale = Date.now() - new Date(st.updated_at).getTime() > STALE_MS;
            return (
              <li key={st.id} className="row" style={{ gap: 8, padding: "6px 0", justifyContent: "space-between" }}>
                <span className="small">Appareil</span>
                <span>
                  {!st.analysis_active ? (
                    <span className="badge" style={{ color: "var(--warning)" }}>⏸ inactive</span>
                  ) : stale ? (
                    <span className="badge" style={{ color: "var(--warning)" }}>⚠️ état incertain</span>
                  ) : (
                    <span className="badge" style={{ color: "var(--good)" }}>🫶 active</span>
                  )}
                  <span className="muted small" style={{ marginLeft: 8 }}>
                    {!st.analysis_active
                      ? (st.last_revoked_at ? `coupée ${fmtAgo(st.last_revoked_at)}` : "")
                      : stale ? `silencieuse depuis ${fmtAgo(st.updated_at)}` : `dernière nouvelle ${fmtDateTime(st.updated_at)}`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small" style={{ marginTop: 6 }}>
        Transparence : si l'ado retire l'accès (son droit), c'est signalé ici — jamais en cachette.
      </p>
    </div>
  );
}

/* ------------------------- Tableau par CATÉGORIES (G6) ------------------- */
function CategoriesCard({ s }: { s: SafetyHook }) {
  // Agrégation par catégorie / gravité (métadonnées) — JAMAIS de contenu.
  const agg = new Map<SafetyCategory, { total: number; high: number; medium: number; low: number }>();
  for (const sig of s.signals) {
    const a = agg.get(sig.category) ?? { total: 0, high: 0, medium: 0, low: 0 };
    a.total += 1;
    a[sig.severity] += 1;
    agg.set(sig.category, a);
  }
  const anySignal = s.signals.length > 0;

  return (
    <div className="card">
      <h2>Par catégorie <span className="muted small">(alertes de métadonnées)</span></h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        Regroupement des signaux détectés sur l'appareil. <b>Aucun contenu</b> — seulement catégorie,
        gravité et compte.
      </p>
      {!anySignal ? (
        <EmptyState icon="🌤" title="Aucun signal"
          hint="Tant que rien n'est détecté, rien n'apparaît ici. C'est bon signe." />
      ) : (
        <div style={{ marginTop: 8 }}>
          {SAFETY_CATEGORIES.map((c) => {
            const a = agg.get(c.key);
            return (
              <div key={c.key} className="row"
                style={{ gap: 10, padding: "8px 4px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                <span className="app-ic" style={{ background: safetyCategoryColor(c.key), width: 28, height: 28, fontSize: ".9rem" }}>
                  {c.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.label}</div>
                  <div className="muted small">{c.hint}</div>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  {SEVERITY_ORDER.map((sev) =>
                    a && a[sev] > 0 ? (
                      <span key={sev} className="badge" style={{ color: severityColor(sev) }}>
                        {SEVERITY_LABEL[sev]} · {a[sev]}
                      </span>
                    ) : null,
                  )}
                  <b style={{ marginLeft: 6 }}>{a?.total ?? 0}</b>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------- Journal des signaux (sans contenu) ------------ */
function SignalsCard({ s, busy, run, acknowledge }: {
  s: SafetyHook; busy: boolean; run: RunFn; acknowledge: (id: string) => Promise<{ error: string | null }>;
}) {
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Signaux récents <span className="muted small">(métadonnées)</span></h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        Catégorie + gravité + application source + heure. <b>Jamais</b> le texte, l'extrait ou le message.
      </p>
      {s.signals.length === 0 ? (
        <EmptyState icon="🗂" title="Aucun signal" hint="Les alertes de catégorie remonteront ici." />
      ) : (
        <table className="tbl">
          <thead><tr>
            <th>Catégorie</th><th>Gravité</th><th>Application</th><th>Occur.</th><th>Quand</th><th></th>
          </tr></thead>
          <tbody>
            {s.signals.map((sig) => (
              <tr key={sig.id} style={{ opacity: sig.acknowledged_at ? 0.55 : 1 }}>
                <td>
                  <span className="badge" style={{ color: safetyCategoryColor(sig.category) }}>
                    {safetyCategoryLabel(sig.category)}
                  </span>
                </td>
                <td><span className="badge" style={{ color: severityColor(sig.severity) }}>
                  {SEVERITY_LABEL[sig.severity]}
                </span></td>
                <td className="small"><code>{sig.source_app ?? "—"}</code></td>
                <td className="small">{sig.occurrence_count}</td>
                <td className="muted small">{fmtDateTime(sig.occurred_at)}</td>
                <td>
                  {sig.acknowledged_at
                    ? <span className="muted small">vu</span>
                    : <button className="link" disabled={busy} onClick={() => run(() => acknowledge(sig.id))}>Marquer vu</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------- Ressources d'aide (V12) ----------------------- */
function ResourcesCard() {
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Ressources d'aide</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        En cas de difficulté, ces services d'écoute et de signalement peuvent aider — vous et l'ado.
      </p>
      <div className="grid cols-2" style={{ gap: 12 }}>
        {HELP_RESOURCES.map((r) => (
          <div key={r.name} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{r.name}</strong>
              <a className="link" href={r.url} target="_blank" rel="noreferrer noopener">ouvrir ↗</a>
            </div>
            <div className="small" style={{ margin: "4px 0" }}>{r.contact}</div>
            <div className="muted small">{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
