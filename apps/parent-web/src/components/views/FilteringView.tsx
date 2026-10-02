import { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  DOMAIN_ACTION_LABEL, FILTER_CATEGORIES, FILTER_PRESETS, YOUTUBE_MODE_LABEL,
  categoryLabel, filterCategoryColor, normalizeDomain, toPolicyUpsert, useFilter,
} from "../../lib/filter";
import { fmtDateTime } from "../../lib/format";
import { EmptyState } from "../Ui";
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

export function FilteringView({ familyId, child }: { familyId: string; child: Child }) {
  const childId = child.id;
  const f = useFilter(familyId, childId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (f.loading) return <p className="muted">Chargement du filtrage…</p>;

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
    return { error: error?.message ?? null };
  }

  return (
    <div className="grid dash" style={{ gap: 18 }}>
      {f.error && <p className="msg error" style={{ gridColumn: "1 / -1" }}>{f.error}</p>}
      {msg && <p className="msg error" style={{ gridColumn: "1 / -1" }}>{msg}</p>}

      <StatusCard f={f} busy={busy} run={run} savePolicy={savePolicy} child={child} />
      <SafeSearchCard f={f} busy={busy} run={run} savePolicy={savePolicy} />
      <CategoriesCard f={f} busy={busy} run={run} savePolicy={savePolicy} />
      <AskToBrowseCard f={f} familyId={familyId} busy={busy} run={run} />
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
      <h2>Filtrage du web</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        Filtrage par <b>nom de domaine (DNS) sur l'appareil</b> — aucune inspection du contenu,
        aucun déchiffrement. Visible par l'enfant dans « mes données ».
      </p>

      <label className="row" style={{ gap: 8, marginTop: 8 }}>
        <input type="checkbox" checked={enabled} disabled={busy}
          onChange={(e) => run(() => savePolicy({ enabled: e.target.checked }))} />
        <span><b>Activer le filtrage</b> pour {child.display_name}</span>
      </label>

      <h3 style={{ marginTop: 18 }}>État de la protection</h3>
      {f.status.length === 0 ? (
        <p className="muted small">
          Aucun appareil n'a encore signalé l'état du filtrage. Il apparaîtra ici une fois le
          filtrage autorisé sur l'appareil enfant.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {f.status.map((s) => (
            <li key={s.id} className="row" style={{ gap: 8, padding: "6px 0", justifyContent: "space-between" }}>
              <span className="small">Appareil</span>
              <span>
                {s.vpn_active
                  ? <span className="badge" style={{ color: "var(--good)" }}>🛡️ actif</span>
                  : <span className="badge" style={{ color: "var(--danger)" }}>⚠️ désactivé</span>}
                <span className="muted small" style={{ marginLeft: 8 }}>
                  {s.vpn_active
                    ? (s.last_active_at ? `depuis ${fmtDateTime(s.last_active_at)}` : "")
                    : (s.last_revoked_at ? `coupé le ${fmtDateTime(s.last_revoked_at)}` : "")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small" style={{ marginTop: 6 }}>
        Anti-contournement <b>transparent</b> (C9) : si le filtrage est désactivé, c'est signalé ici
        et à l'enfant — jamais en cachette.
      </p>

      <h3 style={{ marginTop: 18 }}>Préréglages par âge</h3>
      <div className="row" style={{ gap: 8 }}>
        {(Object.keys(FILTER_PRESETS) as AgeProfile[]).map((k) => (
          <button key={k} className={policy?.age_preset === k ? "" : "ghost"} disabled={busy}
            onClick={() => run(() => applyPreset(k))}>{FILTER_PRESETS[k].label}</button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        Jeune enfant → liste blanche stricte ; (pré)ado → catégories + Ask-to-Browse. Ajustable ci-contre.
      </p>
    </div>
  );
}

/* ------------------------- SafeSearch / YouTube / modes ------------------ */
function SafeSearchCard({ f, busy, run, savePolicy }: Base) {
  const policy = f.policy;
  return (
    <div className="card">
      <h2>SafeSearch & modes</h2>

      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={policy?.safe_search ?? true} disabled={busy}
          onChange={(e) => run(() => savePolicy({ safe_search: e.target.checked }))} />
        <span>Forcer <b>SafeSearch</b> (Google, Bing, DuckDuckGo) — réécriture DNS (C3)</span>
      </label>

      <h3 style={{ marginTop: 16 }}>YouTube mode restreint (C4)</h3>
      <div className="inline">
        <select value={policy?.youtube_restriction ?? "moderate"} disabled={busy}
          onChange={(e) => run(() => savePolicy({ youtube_restriction: e.target.value as YoutubeMode }))}>
          {(Object.keys(YOUTUBE_MODE_LABEL) as YoutubeMode[]).map((m) =>
            <option key={m} value={m}>{YOUTUBE_MODE_LABEL[m]}</option>)}
        </select>
        <span className="muted small">via restrict(moderate).youtube.com</span>
      </div>

      <h3 style={{ marginTop: 16 }}>Liste blanche stricte (C5)</h3>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={policy?.whitelist_only ?? false} disabled={busy}
          onChange={(e) => run(() => savePolicy({ whitelist_only: e.target.checked }))} />
        <span>N'autoriser <b>que</b> les domaines de la liste blanche (+ services essentiels)</span>
      </label>
      <p className="muted small" style={{ marginTop: -2 }}>
        Recommandé pour le jeune enfant. Les services système et les urgences restent toujours accessibles.
      </p>

      <h3 style={{ marginTop: 16 }}>Ask-to-Browse (C6)</h3>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={policy?.ask_to_browse ?? false} disabled={busy}
          onChange={(e) => run(() => savePolicy({ ask_to_browse: e.target.checked }))} />
        <span>Permettre à l'enfant de <b>demander l'accès</b> à un site bloqué</span>
      </label>

      <h3 style={{ marginTop: 16 }}>Journal des domaines</h3>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={policy?.log_allowed ?? false} disabled={busy}
          onChange={(e) => run(() => savePolicy({ log_allowed: e.target.checked }))} />
        <span>Consigner aussi les domaines <b>autorisés</b> (sinon : seulement les blocages)</span>
      </label>
      <div className="inline" style={{ marginTop: 8 }}>
        <label className="fld">Rétention (jours)
          <input type="number" min={1} max={365} defaultValue={policy?.retention_days ?? 30} style={{ width: 90 }}
            onBlur={(e) => run(() => savePolicy({ retention_days: Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 30)) }))} />
        </label>
        <span className="muted small">métadonnées seulement — jamais d'URL ni de contenu</span>
      </div>
    </div>
  );
}

/* ------------------------- Catégories (C1/C7) ---------------------------- */
function CategoriesCard({ f, busy, run, savePolicy }: Base) {
  const blocked = new Set(f.policy?.blocked_categories ?? []);

  function toggle(cat: FilterCategory, on: boolean) {
    const next = new Set(blocked);
    if (on) next.add(cat); else next.delete(cat);
    return savePolicy({ blocked_categories: Array.from(next) });
  }

  return (
    <div className="card">
      <h2>Catégories bloquées</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        Le contenu adulte (C7) est bloqué par défaut dans tous les préréglages.
      </p>
      <div style={{ marginTop: 8 }}>
        {FILTER_CATEGORIES.map((c) => (
          <label key={c.key} className="row"
            style={{ gap: 10, padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
            <input type="checkbox" checked={blocked.has(c.key)} disabled={busy}
              onChange={(e) => run(() => toggle(c.key, e.target.checked))} />
            <span className="app-ic" style={{ background: filterCategoryColor(c.key), width: 28, height: 28, fontSize: ".9rem" }}>
              {c.icon}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{c.label}</div>
              <div className="muted small">{c.hint}</div>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/* ------------------------- Ask-to-Browse : file d'approbation (C6) ------- */
function AskToBrowseCard({ f, familyId, busy, run }: {
  f: ReturnType<typeof useFilter>; familyId: string; busy: boolean; run: RunFn;
}) {
  async function decide(req: AccessRequest, approve: boolean) {
    const { data: auth } = await supabase.auth.getUser();
    const decided_by = auth.user?.id ?? null;
    const domain = typeof req.payload?.domain === "string" ? req.payload.domain : null;

    if (approve && domain) {
      const { error: rErr } = await supabase.from("filter_rules").upsert(
        { family_id: familyId, child_id: req.child_id, domain, action: "allow", note: "ask_to_browse" },
        { onConflict: "child_id,domain" });
      if (rErr) return { error: rErr.message };
    }
    const { error } = await supabase.from("requests")
      .update({ status: approve ? "approved" : "denied", decided_by, decided_at: new Date().toISOString() })
      .eq("id", req.id);
    return { error: error?.message ?? null };
  }

  return (
    <div className="card">
      <h2>Demandes d'accès <span className="muted small">({f.browseRequests.length})</span></h2>
      {f.browseRequests.length === 0 ? (
        <EmptyState icon="🙌" title="Aucune demande en attente"
          hint="Quand l'enfant demande l'accès à un site bloqué, il apparaît ici." />
      ) : (
        f.browseRequests.map((req) => (
          <div key={req.id} style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{String(req.payload?.domain ?? "domaine inconnu")}</strong>
              <span className="badge">Ask-to-Browse</span>
            </div>
            {req.child_note && <p className="muted small" style={{ margin: "4px 0" }}>« {req.child_note} »</p>}
            <div className="muted small">{fmtDateTime(req.created_at)}</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button disabled={busy} onClick={() => run(() => decide(req, true))}>Autoriser le domaine</button>
              <button className="ghost" disabled={busy} onClick={() => run(() => decide(req, false))}>Refuser</button>
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
  const [domain, setDomain] = useState("");
  const [action, setAction] = useState<FilterRuleAction>("block");
  const [inputErr, setInputErr] = useState<string | null>(null);

  const allow = f.rules.filter((r) => r.action === "allow");
  const block = f.rules.filter((r) => r.action === "block");

  async function add() {
    const d = normalizeDomain(domain);
    if (!d) { setInputErr("Domaine invalide (ex. exemple.com)."); return { error: null }; }
    setInputErr(null);
    const { error } = await supabase.from("filter_rules").upsert(
      { family_id: familyId, child_id: childId, domain: d, action },
      { onConflict: "child_id,domain" });
    if (!error) setDomain("");
    return { error: error?.message ?? null };
  }
  async function remove(id: string) {
    const { error } = await supabase.from("filter_rules").delete().eq("id", id);
    return { error: error?.message ?? null };
  }

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Listes de domaines</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        Une règle s'applique au domaine <b>et à ses sous-domaines</b>. « Autoriser » surclasse un
        blocage de catégorie ; « Bloquer » interdit un domaine précis.
      </p>
      <form className="inline" onSubmit={(e) => { e.preventDefault(); run(add); }} style={{ marginBottom: 6 }}>
        <input placeholder="exemple.com" value={domain} onChange={(e) => setDomain(e.target.value)}
          style={{ flex: 1, minWidth: 200 }} />
        <select value={action} onChange={(e) => setAction(e.target.value as FilterRuleAction)}>
          <option value="block">Bloquer (liste noire)</option>
          <option value="allow">Autoriser (liste blanche)</option>
        </select>
        <button disabled={busy || !domain.trim()} type="submit">+ Ajouter</button>
      </form>
      {inputErr && <p className="msg error" style={{ marginTop: 0 }}>{inputErr}</p>}

      <div className="grid cols-2" style={{ gap: 16, marginTop: 10 }}>
        <DomainList title="Liste blanche" icon="✅" rules={allow} busy={busy}
          onRemove={(id) => run(() => remove(id))} empty="Aucun domaine explicitement autorisé." />
        <DomainList title="Liste noire" icon="⛔" rules={block} busy={busy}
          onRemove={(id) => run(() => remove(id))} empty="Aucun domaine explicitement bloqué." />
      </div>
    </div>
  );
}

function DomainList({ title, icon, rules, busy, onRemove, empty }: {
  title: string; icon: string; rules: ReturnType<typeof useFilter>["rules"];
  busy: boolean; onRemove: (id: string) => void; empty: string;
}) {
  return (
    <div>
      <h3>{icon} {title} <span className="muted small">({rules.length})</span></h3>
      {rules.length === 0 ? <p className="muted small">{empty}</p> : (
        <ul className="scroll" style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 240 }}>
          {rules.map((r) => (
            <li key={r.id} className="row"
              style={{ gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)", justifyContent: "space-between" }}>
              <code style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.domain}</code>
              <span>
                {r.note === "ask_to_browse" && <span className="muted small" style={{ marginRight: 8 }}>demandé</span>}
                <button className="link" disabled={busy} onClick={() => onRemove(r.id)}>✕</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------- Journal de domaines (F4-F6) ------------------- */
function JournalCard({ f }: { f: ReturnType<typeof useFilter> }) {
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Journal des domaines <span className="muted small">(métadonnées)</span></h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        Domaine + catégorie + action + heure. <b>Jamais</b> d'URL complète, de requête ni de contenu.
        Conservé {f.policy?.retention_days ?? 30} jours (purge automatique).
      </p>
      {f.events.length === 0 ? (
        <EmptyState icon="🗂" title="Aucun événement"
          hint="Les domaines bloqués (et autorisés, si activé) remonteront ici." />
      ) : (
        <table className="tbl">
          <thead><tr><th>Domaine</th><th>Catégorie</th><th>Action</th><th>Quand</th></tr></thead>
          <tbody>
            {f.events.map((ev) => (
              <tr key={ev.id}>
                <td><code>{ev.domain}</code></td>
                <td>
                  <span className="badge" style={{ color: filterCategoryColor(ev.category) }}>
                    {categoryLabel(ev.category)}
                  </span>
                </td>
                <td className="small">{DOMAIN_ACTION_LABEL[ev.action]}</td>
                <td className="muted small">{fmtDateTime(ev.occurred_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
