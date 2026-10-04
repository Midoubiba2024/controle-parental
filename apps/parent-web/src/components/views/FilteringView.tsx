import { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  DOMAIN_ACTION_LABEL, FILTER_CATEGORIES, FILTER_PRESETS, YOUTUBE_MODE_LABEL,
  categoryLabel, filterCategoryColor, normalizeDomain, toPolicyUpsert, useFilter,
} from "../../lib/filter";
import { fmtAgo, fmtDateTime } from "../../lib/format";
import type { CSSProperties } from "react";
import { Ban, CircleCheck, FolderOpen, Hand, Plus, ShieldCheck, ShieldOff, TriangleAlert, X } from "lucide-react";
import { EmptyState, ViewSkeleton, useShowMore } from "../Ui";
import { filterCategoryIcon, ic, icSm } from "../icons";
import { Trans, errorMessage, useI18n } from "../../i18n";
import type {
  AccessRequest, AgeProfile, Child, FilterCategory, FilterPolicy,
  FilterRuleAction, YoutubeMode,
} from "../../lib/types";

/* =============================================================================
   LOT 4 — Filtrage réseau & contenu (module C). Le filtrage est un SINKHOLE DNS
   LOCAL côté appareil (aucun MITM, aucun déchiffrement, aucune inspection de
   contenu). Cette vue pilote : catégories (C1/C7), listes blanche/noire (C2),
   SafeSearch (C3/C4), preset par âge (C5), Ask-to-Browse (C6), et affiche le
   journal de DOMAINES (métadonnées, F4-F6) + l'état du VPN (anti-contournement
   transparent C9). Transparence : tout est aussi visible côté enfant.
   ============================================================================= */

// Au-delà de ce délai sans heartbeat, l'état « actif » devient « incertain »
// (la synchro/heartbeat de l'appareil tourne ~toutes les 2 min).
const STALE_MS = 5 * 60_000;

export function FilteringView({ familyId, child }: { familyId: string; child: Child }) {
  const childId = child.id;
  const f = useFilter(familyId, childId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (f.loading) return <ViewSkeleton compact />;

  async function run(fn: () => Promise<{ error?: string | null } | void>) {
    setBusy(true); setMsg(null);
    const res = await fn();
    setBusy(false);
    if (res && res.error) setMsg(res.error);
    else f.reload();
  }

  async function savePolicy(patch: Partial<FilterPolicy>) {
    const base = toPolicyUpsert(f.policy, familyId, childId);
    const { error } = await supabase.from("filter_policy")
      .upsert({ ...base, ...patch }, { onConflict: "child_id" });
    return { error: error ? errorMessage(error) : null };
  }

  return (
    <div className="grid dash">
      {f.error && <p className="msg error" style={{ gridColumn: "1 / -1" }}>{f.error}</p>}
      {msg && <p className="msg error" style={{ gridColumn: "1 / -1" }}>{msg}</p>}

      {/* Deux colonnes équilibrées : état + catégories ; recherche sécurisée + demandes. */}
      <div className="stack">
        <StatusCard f={f} busy={busy} run={run} savePolicy={savePolicy} child={child} />
        <CategoriesCard f={f} busy={busy} run={run} savePolicy={savePolicy} />
      </div>
      <div className="stack">
        <SafeSearchCard f={f} busy={busy} run={run} savePolicy={savePolicy} />
        <AskToBrowseCard f={f} familyId={familyId} busy={busy} run={run} />
      </div>
      <ListsCard f={f} familyId={familyId} childId={childId} busy={busy} run={run} />
      <JournalCard f={f} />
    </div>
  );
}

type SaveFn = (patch: Partial<FilterPolicy>) => Promise<{ error: string | null }>;
type RunFn = (fn: () => Promise<{ error?: string | null } | void>) => void;
interface Base { f: ReturnType<typeof useFilter>; busy: boolean; run: RunFn; savePolicy: SaveFn; }

/* ------------------------- État + interrupteur général + presets --------- */
function StatusCard({ f, busy, run, savePolicy, child }: Base & { child: Child }) {
  const { t } = useI18n();
  const policy = f.policy;
  const enabled = policy?.enabled ?? true;

  async function applyPreset(profile: AgeProfile) {
    const p = FILTER_PRESETS[profile];
    return savePolicy({
      age_preset: profile,
      blocked_categories: p.blocked_categories,
      safe_search: p.safe_search,
      youtube_restriction: p.youtube_restriction,
      whitelist_only: p.whitelist_only,
      ask_to_browse: p.ask_to_browse,
      enabled: true,
    });
  }

  return (
    <div className="card">
      <h2>{t("views.filtering.status.title")}</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        <Trans k="views.filtering.status.intro" tags={{ b: (c) => <b>{c}</b> }} />
      </p>

      <label className="check">
        <input type="checkbox" checked={enabled} disabled={busy}
          onChange={(e) => run(() => savePolicy({ enabled: e.target.checked }))} />
        <span><Trans k="views.filtering.status.enableToggle" tags={{ b: (c) => <b>{c}</b> }} params={{ name: child.display_name }} /></span>
      </label>

      <h3 style={{ marginTop: 18 }}>{t("views.filtering.status.protectionTitle")}</h3>
      {f.status.length === 0 ? (
        <p className="muted small">
          {t("views.filtering.status.noDevice")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {f.status.map((s) => {
            // Un heartbeat périmé ne doit PAS afficher « actif » (masquerait une app
            // tuée → défait la visibilité C9). On calcule la fraîcheur depuis updated_at.
            const stale = Date.now() - new Date(s.updated_at).getTime() > STALE_MS;
            return (
              <li key={s.id} className="row" style={{ gap: 8, padding: "6px 0", justifyContent: "space-between" }}>
                <span className="small">{t("views.filtering.status.device")}</span>
                <span>
                  {!s.vpn_active ? (
                    <span className="badge danger"><ShieldOff {...icSm} size={14} />{t("views.filtering.status.badgeDisabled")}</span>
                  ) : stale ? (
                    <span className="badge warn"><TriangleAlert {...icSm} size={14} />{t("views.filtering.status.badgeUncertain")}</span>
                  ) : (
                    <span className="badge good"><ShieldCheck {...icSm} size={14} />{t("views.filtering.status.badgeActive")}</span>
                  )}
                  <span className="muted small" style={{ marginInlineStart: 8 }}>
                    {!s.vpn_active
                      ? (s.last_revoked_at ? t("views.filtering.status.cutAgo", { ago: fmtAgo(s.last_revoked_at) }) : "")
                      : stale
                        ? t("views.filtering.status.silentSince", { ago: fmtAgo(s.updated_at) })
                        : t("views.filtering.status.lastSeen", { when: fmtDateTime(s.updated_at) })}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small" style={{ marginTop: 6 }}>
        <Trans k="views.filtering.status.antiBypass" tags={{ b: (c) => <b>{c}</b> }} />
      </p>

      <h3 style={{ marginTop: 18 }}>{t("views.filtering.status.presetsTitle")}</h3>
      <div className="row" style={{ gap: 8 }}>
        {(Object.keys(FILTER_PRESETS) as AgeProfile[]).map((k) => (
          <button key={k} type="button" className={policy?.age_preset === k ? "" : "ghost"} aria-pressed={policy?.age_preset === k} disabled={busy}
            onClick={() => run(() => applyPreset(k))}>{FILTER_PRESETS[k].label}</button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        {t("views.filtering.status.presetsHint")}
      </p>
    </div>
  );
}

/* ------------------------- SafeSearch / YouTube / modes ------------------ */
function SafeSearchCard({ f, busy, run, savePolicy }: Base) {
  const { t } = useI18n();
  const policy = f.policy;
  return (
    <div className="card">
      <h2>{t("views.filtering.safeSearch.title")}</h2>

      <label className="check">
        <input type="checkbox" checked={policy?.safe_search ?? true} disabled={busy}
          onChange={(e) => run(() => savePolicy({ safe_search: e.target.checked }))} />
        <span><Trans k="views.filtering.safeSearch.forceSafeSearch" tags={{ b: (c) => <b>{c}</b> }} /></span>
      </label>

      <h3 style={{ marginTop: 16 }}>{t("views.filtering.safeSearch.youtubeTitle")}</h3>
      <div className="inline">
        <select value={policy?.youtube_restriction ?? "moderate"} disabled={busy}
          onChange={(e) => run(() => savePolicy({ youtube_restriction: e.target.value as YoutubeMode }))}>
          {(Object.keys(YOUTUBE_MODE_LABEL) as YoutubeMode[]).map((m) =>
            <option key={m} value={m}>{YOUTUBE_MODE_LABEL[m]}</option>)}
        </select>
        <span className="muted small">{t(`views.filtering.safeSearch.youtubeHint.${policy?.youtube_restriction ?? "moderate"}`)}</span>
      </div>

      <h3 style={{ marginTop: 16 }}>{t("views.filtering.safeSearch.whitelistTitle")}</h3>
      <label className="check">
        <input type="checkbox" checked={policy?.whitelist_only ?? false} disabled={busy}
          onChange={(e) => run(() => savePolicy({ whitelist_only: e.target.checked }))} />
        <span><Trans k="views.filtering.safeSearch.whitelistOnly" tags={{ b: (c) => <b>{c}</b> }} /></span>
      </label>
      <p className="muted small" style={{ marginTop: -2 }}>
        {t("views.filtering.safeSearch.whitelistHint")}
      </p>

      <h3 style={{ marginTop: 16 }}>{t("views.filtering.safeSearch.askToBrowseTitle")}</h3>
      <label className="check">
        <input type="checkbox" checked={policy?.ask_to_browse ?? false} disabled={busy}
          onChange={(e) => run(() => savePolicy({ ask_to_browse: e.target.checked }))} />
        <span><Trans k="views.filtering.safeSearch.askToBrowse" tags={{ b: (c) => <b>{c}</b> }} /></span>
      </label>

      <h3 style={{ marginTop: 16 }}>{t("views.filtering.safeSearch.journalTitle")}</h3>
      <label className="check">
        <input type="checkbox" checked={policy?.log_allowed ?? false} disabled={busy}
          onChange={(e) => run(() => savePolicy({ log_allowed: e.target.checked }))} />
        <span><Trans k="views.filtering.safeSearch.logAllowed" tags={{ b: (c) => <b>{c}</b> }} /></span>
      </label>
      <div className="inline" style={{ marginTop: 8 }}>
        <label className="fld">{t("views.filtering.safeSearch.retentionLabel")}
          <input type="number" min={1} max={365} defaultValue={policy?.retention_days ?? 30} style={{ width: 90 }}
            onBlur={(e) => run(() => savePolicy({ retention_days: Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 30)) }))} />
        </label>
        <span className="muted small">{t("views.filtering.safeSearch.retentionHint")}</span>
      </div>
    </div>
  );
}

/* ------------------------- Catégories (C1/C7) ---------------------------- */
function CategoriesCard({ f, busy, run, savePolicy }: Base) {
  const { t } = useI18n();
  const blocked = new Set(f.policy?.blocked_categories ?? []);

  function toggle(cat: FilterCategory, on: boolean) {
    const next = new Set(blocked);
    if (on) next.add(cat); else next.delete(cat);
    return savePolicy({ blocked_categories: Array.from(next) });
  }

  return (
    <div className="card">
      <h2>{t("views.filtering.categories.title")}</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        {t("views.filtering.categories.intro")}
      </p>
      <div style={{ marginTop: 8 }}>
        {FILTER_CATEGORIES.map((c) => {
          const Icon = filterCategoryIcon(c.key);
          return (
          <label key={c.key} className="row"
            style={{ gap: 12, padding: "10px 4px", borderBottom: "1px solid var(--c-divider)", flexWrap: "nowrap" }}>
            <input type="checkbox" checked={blocked.has(c.key)} disabled={busy}
              onChange={(e) => run(() => toggle(c.key, e.target.checked))} />
            <span className="app-ic sm" style={{ "--ic-color": filterCategoryColor(c.key) } as CSSProperties}>
              <Icon {...ic} size={18} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{c.label}</div>
              <div className="muted small">{c.hint}</div>
            </span>
          </label>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------- Ask-to-Browse : file d'approbation (C6) ------- */
function AskToBrowseCard({ f, familyId, busy, run }: {
  f: ReturnType<typeof useFilter>; familyId: string; busy: boolean; run: RunFn;
}) {
  const { t } = useI18n();
  async function decide(req: AccessRequest, approve: boolean) {
    const { data: auth } = await supabase.auth.getUser();
    const decided_by = auth.user?.id ?? null;
    const domain = typeof req.payload?.domain === "string" ? req.payload.domain : null;

    if (approve && domain) {
      const { error: rErr } = await supabase.from("filter_rules").upsert(
        { family_id: familyId, child_id: req.child_id, domain, action: "allow", note: "ask_to_browse" },
        { onConflict: "child_id,domain" });
      if (rErr) return { error: errorMessage(rErr) };
    }
    const { error } = await supabase.from("requests")
      .update({ status: approve ? "approved" : "denied", decided_by, decided_at: new Date().toISOString() })
      .eq("id", req.id);
    return { error: error ? errorMessage(error) : null };
  }

  return (
    <div className="card">
      <h2>{t("views.filtering.askToBrowse.title")} <span className="muted small">{t("views.filtering.askToBrowse.count", { count: f.browseRequests.length })}</span></h2>
      {f.browseRequests.length === 0 ? (
        <EmptyState icon={Hand} title={t("views.filtering.askToBrowse.emptyTitle")}
          hint={t("views.filtering.askToBrowse.emptyHint")} />
      ) : (
        f.browseRequests.map((req) => (
          <div key={req.id} style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{String(req.payload?.domain ?? t("views.filtering.askToBrowse.unknownDomain"))}</strong>
              <span className="badge">{t("views.filtering.askToBrowse.badge")}</span>
            </div>
            {req.child_note && <p className="muted small" style={{ margin: "4px 0" }}>{t("views.filtering.askToBrowse.childNote", { note: req.child_note })}</p>}
            <div className="muted small">{fmtDateTime(req.created_at)}</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button disabled={busy} onClick={() => run(() => decide(req, true))}>{t("views.filtering.askToBrowse.allowButton")}</button>
              <button className="ghost" disabled={busy} onClick={() => run(() => decide(req, false))}>{t("views.filtering.askToBrowse.denyButton")}</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ------------------------- Listes blanche / noire (C2) ------------------- */
function ListsCard({ f, familyId, childId, busy, run }: {
  f: ReturnType<typeof useFilter>; familyId: string; childId: string; busy: boolean; run: RunFn;
}) {
  const { t } = useI18n();
  const [domain, setDomain] = useState("");
  const [action, setAction] = useState<FilterRuleAction>("block");
  const [inputErr, setInputErr] = useState<string | null>(null);

  const allow = f.rules.filter((r) => r.action === "allow");
  const block = f.rules.filter((r) => r.action === "block");

  function submit() {
    // Valide AVANT d'appeler run (un domaine invalide ne doit pas déclencher de reload).
    const d = normalizeDomain(domain);
    if (!d) { setInputErr(t("views.filtering.lists.invalidDomain")); return; }
    setInputErr(null);
    run(async () => {
      const { error } = await supabase.from("filter_rules").upsert(
        { family_id: familyId, child_id: childId, domain: d, action },
        { onConflict: "child_id,domain" });
      if (!error) setDomain("");
      return { error: error ? errorMessage(error) : null };
    });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("filter_rules").delete().eq("id", id);
    return { error: error ? errorMessage(error) : null };
  }

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>{t("views.filtering.lists.title")}</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        <Trans k="views.filtering.lists.intro" tags={{ b: (c) => <b>{c}</b> }} />
      </p>
      <form className="inline" onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ marginBottom: 6 }}>
        <input aria-label={t("views.filtering.lists.domainLabel")} placeholder={t("views.filtering.lists.domainPlaceholder")} value={domain} onChange={(e) => setDomain(e.target.value)}
          style={{ flex: 1, minWidth: 200 }} />
        <select aria-label={t("views.filtering.lists.actionLabel")} value={action} onChange={(e) => setAction(e.target.value as FilterRuleAction)}>
          <option value="block">{t("views.filtering.lists.actionBlock")}</option>
          <option value="allow">{t("views.filtering.lists.actionAllow")}</option>
        </select>
        <button disabled={busy || !domain.trim()} type="submit"><Plus {...ic} size={18} strokeWidth={2} />{t("views.filtering.lists.addButton")}</button>
      </form>
      {inputErr && <p className="msg error" style={{ marginTop: 0 }}>{inputErr}</p>}

      <div className="grid cols-2" style={{ gap: 16, marginTop: 10 }}>
        <DomainList title={t("views.filtering.lists.allowTitle")} icon={<CircleCheck {...ic} size={18} style={{ color: "var(--c-good)" }} />} rules={allow} busy={busy}
          onRemove={(id) => run(() => remove(id))} empty={t("views.filtering.lists.allowEmpty")} />
        <DomainList title={t("views.filtering.lists.blockTitle")} icon={<Ban {...ic} size={18} style={{ color: "var(--c-danger)" }} />} rules={block} busy={busy}
          onRemove={(id) => run(() => remove(id))} empty={t("views.filtering.lists.blockEmpty")} />
      </div>
    </div>
  );
}

function DomainList({ title, icon, rules, busy, onRemove, empty }: {
  title: string; icon: React.ReactNode; rules: ReturnType<typeof useFilter>["rules"];
  busy: boolean; onRemove: (id: string) => void; empty: string;
}) {
  const { t } = useI18n();
  const { visible, button, truncated } = useShowMore(rules, 8);
  return (
    <div>
      <h3 className="row" style={{ gap: 8 }}>{icon} {title} <span className="muted small">{t("views.filtering.lists.count", { count: rules.length })}</span></h3>
      {rules.length === 0 ? <p className="muted small">{empty}</p> : (
        <>
        <ul className={truncated ? "truncated" : undefined} style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {visible.map((r) => (
            <li key={r.id} className="row"
              style={{ gap: 8, padding: "4px 0", borderBottom: "1px solid var(--c-divider)", justifyContent: "space-between", flexWrap: "nowrap" }}>
              <code style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.domain}</code>
              <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                {r.note === "ask_to_browse" && <span className="muted small" style={{ marginInlineEnd: 8 }}>{t("views.filtering.lists.requested")}</span>}
                <button type="button" className="icon-btn sm" disabled={busy} onClick={() => onRemove(r.id)}
                  aria-label={t("views.filtering.lists.remove", { domain: r.domain })} title={t("views.filtering.lists.remove", { domain: r.domain })}>
                  <X {...ic} size={18} />
                </button>
              </span>
            </li>
          ))}
        </ul>
        {button}
        </>
      )}
    </div>
  );
}

/* ------------------------- Journal de domaines (F4-F6) ------------------- */
function JournalCard({ f }: { f: ReturnType<typeof useFilter> }) {
  const { t } = useI18n();
  const { visible, button, truncated } = useShowMore(f.events, 15);
  const cell = (k: "colCategory" | "colAction" | "colWhen") => t("common.cellLabel", { label: t(`views.filtering.journal.${k}`) });
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>{t("views.filtering.journal.title")} <span className="muted small">{t("views.filtering.journal.subtitle")}</span></h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        <Trans k="views.filtering.journal.intro" tags={{ b: (c) => <b>{c}</b> }}
          params={{ count: f.policy?.retention_days ?? 30 }} />
      </p>
      {f.events.length === 0 ? (
        <EmptyState icon={FolderOpen} title={t("views.filtering.journal.emptyTitle")}
          hint={t("views.filtering.journal.emptyHint")} />
      ) : (
        <>
        <div className={`tbl-wrap${truncated ? " truncated" : ""}`}><table className="tbl">
          <thead><tr>
            <th>{t("views.filtering.journal.colDomain")}</th><th>{t("views.filtering.journal.colCategory")}</th>
            <th>{t("views.filtering.journal.colAction")}</th><th>{t("views.filtering.journal.colWhen")}</th>
          </tr></thead>
          <tbody>
            {visible.map((ev) => (
              <tr key={ev.id}>
                <td><code>{ev.domain}</code></td>
                <td data-label={cell("colCategory")}>
                  <span className="badge">
                    <span className="sw" style={{ background: filterCategoryColor(ev.category) }} />{categoryLabel(ev.category)}
                  </span>
                </td>
                <td className="small" data-label={cell("colAction")}>{DOMAIN_ACTION_LABEL[ev.action]}</td>
                <td className="muted small" data-label={cell("colWhen")}>{fmtDateTime(ev.occurred_at)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {button}
        </>
      )}
    </div>
  );
}
