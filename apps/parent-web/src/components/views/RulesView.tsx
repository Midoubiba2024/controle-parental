import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRules, AGE_PRESETS, DOW_LABELS, DOW_ORDER, SCHEDULE_KIND_LABEL,
  dowBit, dowMaskHas, dowMaskLabel, effectiveDailyLimit, hhmmToMinutes,
  isVacationActive, minutesToHHMM, sendCommand } from "../../lib/rules";
import { byApp, byCategory, type ObservationData } from "../../lib/observation";
import { appInitials, appLabelOf, categoryColor, categoryLabel, fmtDuration, shiftDay } from "../../lib/format";
import { Meter, EmptyState } from "../Ui";
import type {
  AccessPolicy, AgeProfile, Child, RuleAction, Schedule, ScheduleKind,
} from "../../lib/types";

const CATEGORIES = ["social", "game", "video", "audio", "productivity", "maps", "news", "image"];

export function RulesView({ familyId, child, obs }: {
  familyId: string;
  child: Child;
  obs: ObservationData;
}) {
  const childId = child.id;
  const r = useRules(familyId, childId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const today = obs.anchorDay;   // jour de référence issu des données (TZ appareil)
  const usageTodayByPkg = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of byApp(obs.usage, today, today)) m.set(a.packageName, a.ms);
    return m;
  }, [obs.usage, today]);
  const usageTodayTotal = useMemo(
    () => [...usageTodayByPkg.values()].reduce((s, v) => s + v, 0), [usageTodayByPkg]);
  const usageTodayByCat = useMemo(() => byCategory(obs.usage, today, today), [obs.usage, today]);

  if (r.loading) return <p className="muted">Chargement des règles…</p>;

  async function run(fn: () => Promise<{ error?: string | null } | void>) {
    setBusy(true); setMsg(null);
    const res = await fn();
    setBusy(false);
    if (res && res.error) setMsg(res.error);
    else r.reload();
  }

  return (
    <div className="grid dash" style={{ gap: 18 }}>
      {r.error && <p className="msg error">{r.error}</p>}
      {msg && <p className="msg error" style={{ gridColumn: "1 / -1" }}>{msg}</p>}

      <TimeLimitsCard r={r} familyId={familyId} child={child} busy={busy} run={run}
        usageTodayTotal={usageTodayTotal} />
      <InstantControlCard familyId={familyId} childId={childId} devices={obs.devices}
        busy={busy} run={run} commands={r.commands} />
      <GuardsCard r={r} familyId={familyId} childId={childId} busy={busy} run={run} />
      <CategoryRulesCard r={r} familyId={familyId} childId={childId} busy={busy} run={run}
        usageByCat={usageTodayByCat} />
      <AppRulesCard r={r} familyId={familyId} childId={childId} busy={busy} run={run}
        inventory={obs.inventory} usageByPkg={usageTodayByPkg} anchorDay={obs.anchorDay} />
      <SchedulesCard r={r} familyId={familyId} childId={childId} busy={busy} run={run} />
    </div>
  );
}

/* ------------------------- Limites de temps + préréglages ---------------- */
function TimeLimitsCard({ r, familyId, child, busy, run, usageTodayTotal }: Omit<CardBase, "childId"> & {
  child: Child; usageTodayTotal: number;
}) {
  const childId = child.id;
  const policy = r.policy;
  const [global, setGlobal] = useState<string>(policy?.daily_limit_minutes?.toString() ?? "");
  const limitFor = (d: number) => r.limits.find((l) => l.day_of_week === d)?.limit_minutes ?? null;

  const effLimit = effectiveDailyLimit(policy, r.limits, r.grantsToday);
  const bonusToday = r.grantsToday.filter((g) => g.scope_package == null)
    .reduce((s, g) => s + g.bonus_minutes, 0);

  async function savePolicy(patch: Partial<AccessPolicy>) {
    const base = toPolicyUpsert(policy, familyId, childId);
    const { error } = await supabase.from("access_policies")
      .upsert({ ...base, ...patch }, { onConflict: "child_id" });
    return { error: error?.message ?? null };
  }
  async function setWeekday(d: number, minutes: number | null) {
    if (minutes == null) {
      const { error } = await supabase.from("screen_time_limits")
        .delete().eq("child_id", childId).eq("day_of_week", d);
      return { error: error?.message ?? null };
    }
    const { error } = await supabase.from("screen_time_limits").upsert(
      { family_id: familyId, child_id: childId, day_of_week: d, limit_minutes: minutes },
      { onConflict: "child_id,day_of_week" });
    return { error: error?.message ?? null };
  }
  async function applyPreset(profile: AgeProfile) {
    const p = AGE_PRESETS[profile];
    await savePolicy({ daily_limit_minutes: p.dailyMinutes });
    // Week-end (samedi=6, dimanche=0) surchargé.
    await setWeekday(6, p.weekendMinutes);
    await setWeekday(0, p.weekendMinutes);
    // Catégories conseillées (action 'limit').
    for (const c of p.categoryLimits) {
      await supabase.from("app_rules").upsert(
        { family_id: familyId, child_id: childId, target_type: "category",
          target_value: c.category, action: "limit", daily_limit_minutes: c.minutes },
        { onConflict: "child_id,target_type,target_value" });
    }
    return { error: null };
  }

  return (
    <div className="card">
      <h2>Temps d'écran</h2>

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <span className="muted small">Aujourd'hui</span>
        <span style={{ fontWeight: 700 }}>
          {fmtDuration(usageTodayTotal)}{effLimit != null && ` / ${effLimit} min`}
        </span>
      </div>
      <Meter value={usageTodayTotal / 60000} max={effLimit ?? Math.max(1, usageTodayTotal / 60000)}
        color={effLimit != null && usageTodayTotal / 60000 > effLimit ? "var(--danger)" : undefined} />
      {bonusToday > 0 && <p className="muted small" style={{ marginTop: 6 }}>+ {bonusToday} min de bonus aujourd'hui</p>}

      <h3 style={{ marginTop: 18 }}>Préréglages par âge</h3>
      <div className="row" style={{ gap: 8 }}>
        {(Object.keys(AGE_PRESETS) as AgeProfile[]).map((k) => (
          <button key={k} className="ghost" disabled={busy}
            onClick={() => run(() => applyPreset(k))}>{AGE_PRESETS[k].label}</button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        Repères d'aide à la décision — ajustables ci-dessous à tout moment.
      </p>

      <h3 style={{ marginTop: 18 }}>Limite quotidienne (globale)</h3>
      <div className="inline">
        <input type="number" min={0} placeholder="aucune" value={global} style={{ width: 110 }}
          onChange={(e) => setGlobal(e.target.value)} />
        <span className="muted small">minutes / jour</span>
        <button disabled={busy} onClick={() => run(() =>
          savePolicy({ daily_limit_minutes: global.trim() === "" ? null : Math.max(0, parseInt(global, 10) || 0) }))}>
          Enregistrer
        </button>
      </div>

      <h3 style={{ marginTop: 18 }}>Par jour de semaine (surcharge)</h3>
      <div className="row" style={{ gap: 6 }}>
        {DOW_ORDER.map((d) => (
          <WeekdayLimit key={d} label={DOW_LABELS[d]} value={limitFor(d)} busy={busy}
            onSave={(m) => run(() => setWeekday(d, m))} />
        ))}
      </div>

      <h3 style={{ marginTop: 18 }}>Délai de grâce « encore 1 min »</h3>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={policy?.grace_enabled ?? true}
          onChange={(e) => run(() => savePolicy({ grace_enabled: e.target.checked }))} />
        <span>Autoriser une courte prolongation à l'atteinte d'un quota</span>
      </label>
      {(policy?.grace_enabled ?? true) && (
        <div className="inline" style={{ marginTop: 8 }}>
          <label className="fld">Durée (min)
            <input type="number" min={0} max={15} defaultValue={policy?.grace_minutes ?? 1} style={{ width: 80 }}
              onBlur={(e) => run(() => savePolicy({ grace_minutes: Math.min(15, Math.max(0, parseInt(e.target.value, 10) || 0)) }))} />
          </label>
          <label className="fld">Fois / jour
            <input type="number" min={0} defaultValue={policy?.grace_uses_per_day ?? 1} style={{ width: 80 }}
              onBlur={(e) => run(() => savePolicy({ grace_uses_per_day: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
          </label>
        </div>
      )}
    </div>
  );
}

function WeekdayLimit({ label, value, busy, onSave }: {
  label: string; value: number | null; busy: boolean; onSave: (m: number | null) => void;
}) {
  const [v, setV] = useState(value?.toString() ?? "");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <span className="muted small">{label}</span>
      <input type="number" min={0} value={v} placeholder="—" disabled={busy}
        style={{ width: 58, textAlign: "center", padding: "6px 4px" }}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onSave(v.trim() === "" ? null : Math.max(0, parseInt(v, 10) || 0))} />
    </div>
  );
}

/* ------------------------- Pause / verrouillage instantané --------------- */
function InstantControlCard({ familyId, childId, devices, busy, run, commands }: {
  familyId: string; childId: string; devices: ObservationData["devices"]; busy: boolean;
  run: CardBase["run"]; commands: ReturnType<typeof useRules>["commands"];
}) {
  const active = devices.filter((d) => !d.revoked_at);
  const [deviceId, setDeviceId] = useState<string>(active[0]?.id ?? "");
  const [lockMsg, setLockMsg] = useState("");

  function cmd(type: "lock_now" | "pause" | "resume" | "ring" | "message", payload?: Record<string, unknown>) {
    if (!deviceId) { return; }
    run(() => sendCommand({ familyId, childId, deviceId, type, payload }));
  }

  return (
    <div className="card">
      <h2>Pause & verrouillage</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        Action <b>visible</b> par l'enfant, réversible. L'appel d'urgence (112) n'est jamais bloqué.
      </p>
      {active.length === 0 ? (
        <EmptyState icon="📱" title="Aucun appareil appairé" hint="Appairez un appareil dans l'onglet Famille." />
      ) : (
        <>
          {active.length > 1 && (
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} style={{ marginBottom: 10 }}>
              {active.map((d) => <option key={d.id} value={d.id}>{d.label ?? d.model ?? d.platform}</option>)}
            </select>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button disabled={busy} onClick={() => cmd("pause")}>⏸ Pause</button>
            <button className="ghost" disabled={busy} onClick={() => cmd("resume")}>▶ Reprendre</button>
            <button disabled={busy} onClick={() => cmd("lock_now")}>🔒 Verrouiller</button>
            <button className="ghost" disabled={busy} onClick={() => cmd("ring")}>🔔 Faire sonner</button>
          </div>
          <div className="inline" style={{ marginTop: 10 }}>
            <input placeholder="Message sur l'écran (ex. « À table ! »)" value={lockMsg}
              onChange={(e) => setLockMsg(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <button className="ghost" disabled={busy || !lockMsg.trim()}
              onClick={() => { cmd("message", { message: lockMsg.trim() }); setLockMsg(""); }}>Envoyer</button>
          </div>
        </>
      )}
      {commands.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>Dernières commandes</h3>
          <ul className="scroll" style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 160 }}>
            {commands.slice(0, 8).map((c) => (
              <li key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: ".86rem" }}>
                <code>{c.type}</code>
                <span className="badge" style={{ marginLeft: 8 }}>{c.status}</span>
                <span className="muted small"> · {new Date(c.created_at).toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ------------------------- Vacances & verrous système -------------------- */
function GuardsCard({ r, familyId, childId, busy, run }: CardBase) {
  const policy = r.policy;
  async function savePolicy(patch: Partial<AccessPolicy>) {
    const base = toPolicyUpsert(policy, familyId, childId);
    const { error } = await supabase.from("access_policies")
      .upsert({ ...base, ...patch }, { onConflict: "child_id" });
    return { error: error?.message ?? null };
  }
  const vac = isVacationActive(policy);
  return (
    <div className="card">
      <h2>Mode vacances & verrous</h2>

      <h3>Mode vacances / pause de planning</h3>
      <p className="muted small" style={{ marginTop: -6 }}>
        Suspend temporairement les plannings (horaires, Downtime, École). Reprise automatique à la fin.
        {vac && <b style={{ color: "var(--warning)" }}> · actif</b>}
      </p>
      <div className="inline">
        <label className="fld">Du
          <input type="date" defaultValue={policy?.vacation_from ?? ""}
            onBlur={(e) => run(() => savePolicy({ vacation_from: e.target.value || null }))} />
        </label>
        <label className="fld">Au
          <input type="date" defaultValue={policy?.vacation_until ?? ""}
            onBlur={(e) => run(() => savePolicy({ vacation_until: e.target.value || null }))} />
        </label>
        {(policy?.vacation_from || policy?.vacation_until) && (
          <button className="link" disabled={busy}
            onClick={() => run(() => savePolicy({ vacation_from: null, vacation_until: null }))}>Effacer</button>
        )}
      </div>

      <h3 style={{ marginTop: 16 }}>Validation d'installation</h3>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={policy?.block_new_apps ?? false}
          onChange={(e) => run(() => savePolicy({ block_new_apps: e.target.checked }))} />
        <span>Bloquer toute <b>nouvelle application</b> jusqu'à validation du parent</span>
      </label>

      <h3 style={{ marginTop: 16 }}>Verrouillage des réglages système</h3>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={policy?.lock_system_settings ?? false}
          onChange={(e) => run(() => savePolicy({ lock_system_settings: e.target.checked }))} />
        <span>Empêcher la modification de l'heure, des comptes et des options développeur</span>
      </label>
      <p className="muted small">Effectif en mode <b>Renforcé</b> (device owner).</p>

      <h3 style={{ marginTop: 16 }}>Classification d'âge</h3>
      <div className="inline">
        <select defaultValue={policy?.max_content_rating ?? ""}
          onChange={(e) => run(() => savePolicy({ max_content_rating: e.target.value || null }))}>
          <option value="">Aucune restriction</option>
          <option value="PEGI 3">PEGI 3</option>
          <option value="PEGI 7">PEGI 7</option>
          <option value="PEGI 12">PEGI 12</option>
          <option value="PEGI 16">PEGI 16</option>
        </select>
        <span className="muted small">niveau maximal autorisé</span>
      </div>
    </div>
  );
}

/* ------------------------- Règles par catégorie -------------------------- */
function CategoryRulesCard({ r, familyId, childId, busy, run, usageByCat }: CardBase & {
  usageByCat: Map<string, number>;
}) {
  const ruleFor = (cat: string) => r.appRules.find((x) => x.target_type === "category" && x.target_value === cat) ?? null;

  async function setCat(cat: string, action: RuleAction | null, limit?: number | null) {
    if (action == null) {
      const existing = ruleFor(cat);
      if (!existing) return { error: null };
      const { error } = await supabase.from("app_rules").delete().eq("id", existing.id);
      return { error: error?.message ?? null };
    }
    const { error } = await supabase.from("app_rules").upsert(
      { family_id: familyId, child_id: childId, target_type: "category", target_value: cat,
        action, daily_limit_minutes: action === "limit" ? (limit ?? 30) : null },
      { onConflict: "child_id,target_type,target_value" });
    return { error: error?.message ?? null };
  }

  return (
    <div className="card">
      <h2>Règles par catégorie</h2>
      <table className="tbl">
        <thead><tr><th>Catégorie</th><th>Aujourd'hui</th><th>Règle</th><th>Quota</th></tr></thead>
        <tbody>
          {CATEGORIES.map((cat) => {
            const rule = ruleFor(cat);
            const ms = usageByCat.get(cat) ?? 0;
            return (
              <tr key={cat}>
                <td><span className="badge" style={{ color: categoryColor(cat) }}>{categoryLabel(cat)}</span></td>
                <td className="muted small">{ms > 0 ? fmtDuration(ms) : "—"}</td>
                <td>
                  <select value={rule?.action ?? ""} disabled={busy}
                    onChange={(e) => run(() => setCat(cat, (e.target.value || null) as RuleAction | null, rule?.daily_limit_minutes))}>
                    <option value="">Libre</option>
                    <option value="limit">Limiter</option>
                    <option value="block">Bloquer</option>
                    <option value="always_allow">Toujours autoriser</option>
                  </select>
                </td>
                <td>
                  {rule?.action === "limit" && (
                    <input type="number" min={0} defaultValue={rule.daily_limit_minutes ?? 30} style={{ width: 70 }}
                      onBlur={(e) => run(() => setCat(cat, "limit", Math.max(0, parseInt(e.target.value, 10) || 0)))} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------- Règles par application ------------------------ */
function AppRulesCard({ r, familyId, childId, busy, run, inventory, usageByPkg, anchorDay }: CardBase & {
  inventory: ObservationData["inventory"]; usageByPkg: Map<string, number>; anchorDay: string;
}) {
  const [query, setQuery] = useState("");
  const [onlyRecent, setOnlyRecent] = useState(false);
  const recentCut = shiftDay(anchorDay, -2); // apps vues pour la 1re fois dans les 3 derniers jours

  const ruleFor = (pkg: string) => r.appRules.find((x) => x.target_type === "package" && x.target_value === pkg) ?? null;

  const apps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...inventory]
      .filter((a) => !a.removed_at)
      .filter((a) => !onlyRecent || (a.first_seen_at && a.first_seen_at.slice(0, 10) >= recentCut))
      .filter((a) => !q || appLabelOf(a.app_label, a.package_name).toLowerCase().includes(q) || a.package_name.toLowerCase().includes(q))
      .sort((a, b) => (usageByPkg.get(b.package_name) ?? 0) - (usageByPkg.get(a.package_name) ?? 0));
  }, [inventory, query, onlyRecent, recentCut, usageByPkg]);

  async function setApp(pkg: string, action: RuleAction | null, limit?: number | null) {
    const existing = ruleFor(pkg);
    if (action == null) {
      if (!existing) return { error: null };
      const { error } = await supabase.from("app_rules").delete().eq("id", existing.id);
      return { error: error?.message ?? null };
    }
    const { error } = await supabase.from("app_rules").upsert(
      { family_id: familyId, child_id: childId, target_type: "package", target_value: pkg,
        action, daily_limit_minutes: action === "limit" ? (limit ?? 30) : null },
      { onConflict: "child_id,target_type,target_value" });
    return { error: error?.message ?? null };
  }

  const newCount = inventory.filter((a) => !a.removed_at && a.first_seen_at && a.first_seen_at.slice(0, 10) >= recentCut).length;

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Règles par application</h2>
      <div className="inline" style={{ marginBottom: 10 }}>
        <input placeholder="Rechercher une application…" value={query}
          onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={onlyRecent} onChange={(e) => setOnlyRecent(e.target.checked)} />
          <span className="small">Nouvelles apps {newCount > 0 && <b>({newCount})</b>}</span>
        </label>
      </div>
      {apps.length === 0 ? <EmptyState icon="📱" title="Aucune application"
        hint="L'inventaire remonte depuis l'appareil enfant une fois la supervision active." /> : (
        <div className="scroll">
          {apps.map((a) => {
            const rule = ruleFor(a.package_name);
            const ms = usageByPkg.get(a.package_name) ?? 0;
            return (
              <div key={a.id} className="row" style={{ gap: 10, padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
                <span className="app-ic" style={{ background: categoryColor(a.category), width: 30, height: 30, fontSize: ".8rem" }}>
                  {appInitials(a.app_label, a.package_name)}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <div className="nm" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {appLabelOf(a.app_label, a.package_name)}
                  </div>
                  <div className="muted small">{categoryLabel(a.category)}{ms > 0 ? ` · ${fmtDuration(ms)} aujourd'hui` : ""}</div>
                </span>
                {rule?.action === "limit" && (
                  <input type="number" min={0} defaultValue={rule.daily_limit_minutes ?? 30} style={{ width: 64 }}
                    onBlur={(e) => run(() => setApp(a.package_name, "limit", Math.max(0, parseInt(e.target.value, 10) || 0)))} />
                )}
                <select value={rule?.action ?? ""} disabled={busy}
                  onChange={(e) => run(() => setApp(a.package_name, (e.target.value || null) as RuleAction | null, rule?.daily_limit_minutes))}>
                  <option value="">Libre</option>
                  <option value="limit">Limiter</option>
                  <option value="block">Bloquer</option>
                  <option value="allow">Autoriser</option>
                  <option value="always_allow">Toujours autoriser</option>
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------- Plannings réutilisables ----------------------- */
function SchedulesCard({ r, familyId, childId, busy, run }: CardBase) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ScheduleKind>("downtime");

  const assignedIds = new Set(r.childSchedules.filter((cs) => cs.enabled).map((cs) => cs.schedule_id));

  async function createSchedule() {
    if (!name.trim()) return { error: null };
    const { error } = await supabase.from("schedules")
      .insert({ family_id: familyId, name: name.trim(), kind });
    if (!error) setName("");
    return { error: error?.message ?? null };
  }
  async function toggleAssign(scheduleId: string, on: boolean) {
    if (on) {
      const { error } = await supabase.from("child_schedules").upsert(
        { family_id: familyId, child_id: childId, schedule_id: scheduleId, enabled: true },
        { onConflict: "child_id,schedule_id" });
      return { error: error?.message ?? null };
    }
    const { error } = await supabase.from("child_schedules")
      .delete().eq("child_id", childId).eq("schedule_id", scheduleId);
    return { error: error?.message ?? null };
  }

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Plannings <span className="muted small">(réutilisables entre enfants)</span></h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        Horaires autorisés/interdits (A4), Downtime/coucher (A5), mode École (A6). Assignez un planning
        à cet enfant via la case ; les fenêtres horaires s'éditent ci-dessous.
      </p>
      <form className="inline" onSubmit={(e) => { e.preventDefault(); run(createSchedule); }} style={{ marginBottom: 12 }}>
        <input placeholder="Nom (ex. Nuit en semaine)" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value as ScheduleKind)}>
          {(Object.keys(SCHEDULE_KIND_LABEL) as ScheduleKind[]).map((k) =>
            <option key={k} value={k}>{SCHEDULE_KIND_LABEL[k]}</option>)}
        </select>
        <button disabled={busy || !name.trim()} type="submit">+ Planning</button>
      </form>

      {r.schedules.length === 0 ? <EmptyState icon="🗓" title="Aucun planning"
        hint="Créez un premier planning (ex. Downtime du soir) puis assignez-le." /> : (
        r.schedules.map((s) => (
          <ScheduleRow key={s.id} schedule={s} windows={r.windows.filter((w) => w.schedule_id === s.id)}
            assigned={assignedIds.has(s.id)} busy={busy} run={run}
            onToggle={(on) => run(() => toggleAssign(s.id, on))} />
        ))
      )}
    </div>
  );
}

function ScheduleRow({ schedule, windows, assigned, busy, run, onToggle }: {
  schedule: Schedule; windows: ReturnType<typeof useRules>["windows"];
  assigned: boolean; busy: boolean; run: CardBase["run"]; onToggle: (on: boolean) => void;
}) {
  const [start, setStart] = useState("21:00");
  const [end, setEnd] = useState("07:00");
  const [mask, setMask] = useState(127);

  async function addWindow() {
    const { error } = await supabase.from("schedule_windows").insert({
      schedule_id: schedule.id, dow_mask: mask,
      start_minute: hhmmToMinutes(start), end_minute: hhmmToMinutes(end),
    });
    return { error: error?.message ?? null };
  }
  async function delWindow(id: string) {
    const { error } = await supabase.from("schedule_windows").delete().eq("id", id);
    return { error: error?.message ?? null };
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <strong>{schedule.name}</strong>{" "}
          <span className="badge">{SCHEDULE_KIND_LABEL[schedule.kind]}</span>
        </div>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={assigned} disabled={busy} onChange={(e) => onToggle(e.target.checked)} />
          <span className="small">Appliqué à cet enfant</span>
        </label>
      </div>

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        {windows.length === 0 && <span className="muted small">Aucune fenêtre horaire.</span>}
        {windows.map((w) => (
          <span key={w.id} className="badge">
            {dowMaskLabel(w.dow_mask)} · {minutesToHHMM(w.start_minute)}→{minutesToHHMM(w.end_minute)}
            <button className="link" style={{ padding: "0 0 0 6px" }} disabled={busy}
              onClick={() => run(() => delWindow(w.id))}>✕</button>
          </span>
        ))}
      </div>

      <div className="inline" style={{ marginTop: 8 }}>
        <div className="row" style={{ gap: 4 }}>
          {DOW_ORDER.map((d) => (
            <button key={d} type="button" className={dowMaskHas(mask, d) ? "" : "ghost"}
              style={{ padding: "5px 8px", fontSize: ".78rem" }}
              onClick={() => setMask((m) => m ^ dowBit(d))}>{DOW_LABELS[d]}</button>
          ))}
        </div>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <span className="muted">→</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button className="ghost" disabled={busy || mask === 0} onClick={() => run(addWindow)}>+ Fenêtre</button>
      </div>
    </div>
  );
}

/* ------------------------- Divers ---------------------------------------- */
interface CardBase {
  r: ReturnType<typeof useRules>;
  familyId: string;
  childId: string;
  busy: boolean;
  run: (fn: () => Promise<{ error?: string | null } | void>) => void;
}

function toPolicyUpsert(policy: AccessPolicy | null, familyId: string, childId: string) {
  // Base complète pour un upsert idempotent (évite d'écraser avec des null non voulus).
  return {
    family_id: familyId,
    child_id: childId,
    enforcement_mode: policy?.enforcement_mode ?? "standard",
    daily_limit_minutes: policy?.daily_limit_minutes ?? null,
    grace_enabled: policy?.grace_enabled ?? true,
    grace_minutes: policy?.grace_minutes ?? 1,
    grace_uses_per_day: policy?.grace_uses_per_day ?? 1,
    block_new_apps: policy?.block_new_apps ?? false,
    max_content_rating: policy?.max_content_rating ?? null,
    lock_system_settings: policy?.lock_system_settings ?? false,
    vacation_from: policy?.vacation_from ?? null,
    vacation_until: policy?.vacation_until ?? null,
  };
}
