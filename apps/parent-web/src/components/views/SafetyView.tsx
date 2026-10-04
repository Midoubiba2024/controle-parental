import { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  HELP_RESOURCES, SAFETY_CATEGORIES, SEVERITY_LABEL, SEVERITY_ORDER,
  safetyCategoryColor, safetyCategoryLabel, toSafetySettingsUpsert, useSafety,
} from "../../lib/safety";
import { fmtAgo, fmtDateTime } from "../../lib/format";
import type { CSSProperties } from "react";
import { CirclePause, CloudSun, ExternalLink, FolderOpen, HeartHandshake, TriangleAlert } from "lucide-react";
import { EmptyState } from "../Ui";
import { ic, icSm, safetyCategoryIcon } from "../icons";
import { Trans, errorMessage, useI18n } from "../../i18n";
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
  const { t } = useI18n();
  const s = useSafety(familyId, child.id);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (s.loading) return <p className="muted">{t("views.wellbeing.loading")}</p>;

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
    return { error: error ? errorMessage(error) : null };
  }

  async function acknowledge(id: string) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("safety_signals")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: auth.user?.id ?? null })
      .eq("id", id);
    return { error: error ? errorMessage(error) : null };
  }

  return (
    <div className="grid dash">
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
  const { t } = useI18n();
  return (
    <div className="card">
      <h2>{t("views.wellbeing.youngChild.title")}</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        <Trans k="views.wellbeing.youngChild.intro" tags={{ b: (c) => <b>{c}</b> }} />
      </p>
      <p>
        <Trans k="views.wellbeing.youngChild.body" tags={{ b: (c) => <b>{c}</b> }} params={{ name: child.display_name }} />
      </p>
    </div>
  );
}

/* ------------------------- Réglages « mode ado » (K6) + état + pause (K8) - */
function SettingsCard({ s, child, busy, run, saveSettings }: {
  s: SafetyHook; child: Child; busy: boolean; run: RunFn;
  saveSettings: (p: Partial<SafetySettings>) => Promise<{ error: string | null }>;
}) {
  const { t } = useI18n();
  const enabled = s.settings?.analysis_enabled ?? false;
  const mutual = s.settings?.mutual_visibility ?? true;

  return (
    <div className="card">
      <h2>{t("views.wellbeing.settings.title")}</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        <Trans k="views.wellbeing.settings.intro" tags={{ b: (c) => <b>{c}</b> }} params={{ name: child.display_name }} />
      </p>

      <label className="row" style={{ gap: 8, marginTop: 8 }}>
        <input type="checkbox" checked={enabled} disabled={busy}
          onChange={(e) => run(() => saveSettings({ analysis_enabled: e.target.checked }))} />
        <span><Trans k="views.wellbeing.settings.enableToggle" tags={{ b: (c) => <b>{c}</b> }} /></span>
      </label>
      <p className="muted small" style={{ marginTop: -2 }}>
        {t("views.wellbeing.settings.enableHint")}
      </p>

      <label className="row" style={{ gap: 8, marginTop: 10 }}>
        <input type="checkbox" checked={mutual} disabled={busy}
          onChange={(e) => run(() => saveSettings({ mutual_visibility: e.target.checked }))} />
        <span><Trans k="views.wellbeing.settings.mutualToggle" tags={{ b: (c) => <b>{c}</b> }} /></span>
      </label>

      {s.openPauses.length > 0 && (
        <div className="note warn" role="status" style={{ marginTop: 14 }}>
          <CirclePause {...ic} />
          <div>
          {s.openPauses[0].started_at
            ? <Trans k="views.wellbeing.settings.pauseNoticeSince" tags={{ b: (c) => <b>{c}</b> }}
                params={{ name: child.display_name, ago: fmtAgo(s.openPauses[0].started_at) }} />
            : <Trans k="views.wellbeing.settings.pauseNotice" tags={{ b: (c) => <b>{c}</b> }} params={{ name: child.display_name }} />}
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 18 }}>{t("views.wellbeing.settings.statusTitle")}</h3>
      {s.status.length === 0 ? (
        <p className="muted small">
          {t("views.wellbeing.settings.noDevice")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {s.status.map((st) => {
            const stale = Date.now() - new Date(st.updated_at).getTime() > STALE_MS;
            return (
              <li key={st.id} className="row" style={{ gap: 8, padding: "6px 0", justifyContent: "space-between" }}>
                <span className="small">{t("views.wellbeing.settings.device")}</span>
                <span>
                  {!st.analysis_active ? (
                    <span className="badge warn"><CirclePause {...icSm} size={14} />{t("views.wellbeing.settings.badgeInactive")}</span>
                  ) : stale ? (
                    <span className="badge warn"><TriangleAlert {...icSm} size={14} />{t("views.wellbeing.settings.badgeUncertain")}</span>
                  ) : (
                    <span className="badge good"><HeartHandshake {...icSm} size={14} />{t("views.wellbeing.settings.badgeActive")}</span>
                  )}
                  <span className="muted small" style={{ marginInlineStart: 8 }}>
                    {!st.analysis_active
                      ? (st.last_revoked_at ? t("views.wellbeing.settings.cutAgo", { ago: fmtAgo(st.last_revoked_at) }) : "")
                      : stale
                        ? t("views.wellbeing.settings.silentSince", { ago: fmtAgo(st.updated_at) })
                        : t("views.wellbeing.settings.lastSeen", { when: fmtDateTime(st.updated_at) })}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small" style={{ marginTop: 6 }}>
        {t("views.wellbeing.settings.transparency")}
      </p>
    </div>
  );
}

/* ------------------------- Tableau par CATÉGORIES (G6) ------------------- */
function CategoriesCard({ s }: { s: SafetyHook }) {
  const { t } = useI18n();
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
      <h2>{t("views.wellbeing.categories.title")} <span className="muted small">{t("views.wellbeing.categories.subtitle")}</span></h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        <Trans k="views.wellbeing.categories.intro" tags={{ b: (c) => <b>{c}</b> }} />
      </p>
      {!anySignal ? (
        <EmptyState icon={CloudSun} title={t("views.wellbeing.categories.emptyTitle")}
          hint={t("views.wellbeing.categories.emptyHint")} />
      ) : (
        <div style={{ marginTop: 8 }}>
          {SAFETY_CATEGORIES.map((c) => {
            const a = agg.get(c.key);
            const Icon = safetyCategoryIcon(c.key);
            return (
              <div key={c.key} className="row"
                style={{ gap: 12, padding: "10px 4px", borderBottom: "1px solid var(--c-divider)", alignItems: "center" }}>
                <span className="app-ic sm" style={{ "--ic-color": safetyCategoryColor(c.key) } as CSSProperties}>
                  <Icon {...ic} size={18} />
                </span>
                <span style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.label}</div>
                  <div className="muted small">{c.hint}</div>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  {SEVERITY_ORDER.map((sev) =>
                    a && a[sev] > 0 ? (
                      <span key={sev} className={`badge ${sev === "high" ? "danger" : sev === "medium" ? "warn" : "good"}`}>
                        {SEVERITY_LABEL[sev]} · {a[sev]}
                      </span>
                    ) : null,
                  )}
                  <b style={{ marginInlineStart: 6 }}>{a?.total ?? 0}</b>
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
  const { t } = useI18n();
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>{t("views.wellbeing.signals.title")} <span className="muted small">{t("views.wellbeing.signals.subtitle")}</span></h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        <Trans k="views.wellbeing.signals.intro" tags={{ b: (c) => <b>{c}</b> }} />
      </p>
      {s.signals.length === 0 ? (
        <EmptyState icon={FolderOpen} title={t("views.wellbeing.signals.emptyTitle")} hint={t("views.wellbeing.signals.emptyHint")} />
      ) : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr>
            <th>{t("views.wellbeing.signals.colCategory")}</th><th>{t("views.wellbeing.signals.colSeverity")}</th>
            <th>{t("views.wellbeing.signals.colApp")}</th><th>{t("views.wellbeing.signals.colOccurrences")}</th>
            <th>{t("views.wellbeing.signals.colWhen")}</th><th></th>
          </tr></thead>
          <tbody>
            {s.signals.map((sig) => (
              <tr key={sig.id} style={{ opacity: sig.acknowledged_at ? 0.55 : 1 }}>
                <td>
                  <span className="badge">
                    <span className="sw" style={{ background: safetyCategoryColor(sig.category) }} />{safetyCategoryLabel(sig.category)}
                  </span>
                </td>
                <td><span className={`badge ${sig.severity === "high" ? "danger" : sig.severity === "medium" ? "warn" : "good"}`}>
                  {SEVERITY_LABEL[sig.severity]}
                </span></td>
                <td className="small"><code>{sig.source_app ?? t("common.none")}</code></td>
                <td className="small">{sig.occurrence_count}</td>
                <td className="muted small">{fmtDateTime(sig.occurred_at)}</td>
                <td>
                  {sig.acknowledged_at
                    ? <span className="muted small">{t("views.wellbeing.signals.seen")}</span>
                    : <button className="link" disabled={busy} onClick={() => run(() => acknowledge(sig.id))}>{t("views.wellbeing.signals.markSeen")}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

/* ------------------------- Ressources d'aide (V12) ----------------------- */
function ResourcesCard() {
  const { t } = useI18n();
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>{t("views.wellbeing.resources.title")}</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        {t("views.wellbeing.resources.intro")}
      </p>
      <div className="grid cols-2" style={{ gap: 12 }}>
        {HELP_RESOURCES.map((r) => (
          <div key={r.name} className="panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong className="serif" style={{ fontSize: 18 }}>{r.name}</strong>
              <a className="link" href={r.url} target="_blank" rel="noreferrer noopener">{t("views.wellbeing.resources.open")}<ExternalLink {...icSm} /></a>
            </div>
            <div className="small" style={{ margin: "4px 0" }}>{r.contact}</div>
            <div className="muted small">{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
