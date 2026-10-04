import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRules, AGE_PRESETS, DOW_LABELS, DOW_ORDER, SCHEDULE_KIND_LABEL,
  dowBit, dowMaskHas, dowMaskLabel, effectiveDailyLimit, hhmmToMinutes,
  isVacationActive, minutesToHHMM, sendCommand } from "../../lib/rules";
import { byApp, byCategory, type ObservationData } from "../../lib/observation";
import { appInitials, appLabelOf, categoryColor, categoryLabel, fmtDateTime, fmtDuration, shiftDay } from "../../lib/format";
import type { CSSProperties } from "react";
import { BellRing, CalendarDays, Lock, Pause, Play, Plus, Send, Smartphone, X } from "lucide-react";
import { Meter, EmptyState, ViewSkeleton, useShowMore } from "../Ui";
import { ic } from "../icons";
import { errorMessage, Trans, useI18n } from "../../i18n";
import type {
  AccessPolicy, AgeProfile, Child, CommandStatus, CommandType, RuleAction, Schedule, ScheduleKind,
} from "../../lib/types";
import { activeDevicesNewestFirst } from "../../lib/devices";

const CATEGORIES = ["social", "game", "video", "audio", "productivity", "maps", "news", "image"];

const COMMAND_STATUSES: readonly CommandStatus[] = ["pending", "delivered", "acked", "expired", "cancelled"];
const COMMAND_TYPES: readonly CommandType[] = ["lock_now", "pause", "resume", "ring", "message", "locate"];

/** Erreur Supabase → message traduit (jamais le message brut). */
function toResult(error: unknown): { error: string | null } {
  return { error: error ? errorMessage(error) : null };
}

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

  if (r.loading) return <ViewSkeleton compact />;

  async function run(fn: () => Promise<{ error?: string | null } | void>) {
    setBusy(true); setMsg(null);
    const res = await fn();
    setBusy(false);
    if (res && res.error) setMsg(res.error);
    else r.reload();
  }

  return (
    <div className="grid dash rules-cols">
      {r.error && <p className="msg error" style={{ gridColumn: "1 / -1" }}>{r.error}</p>}
      {msg && <p className="msg error" style={{ gridColumn: "1 / -1" }}>{msg}</p>}

      {/* Deux colonnes INDÉPENDANTES : une carte haute ne crée pas de vide dans l'autre. */}
      {/* Sur mobile (une colonne), les .stack s'effacent et .rs-* fixe l'ordre :
          Pause & verrouillage d'abord (action immédiate), puis limites, garde-fous… */}
      <div className="stack">
        <div className="rs rs-time">
          <TimeLimitsCard r={r} familyId={familyId} child={child} busy={busy} run={run}
            usageTodayTotal={usageTodayTotal} />
        </div>
        <div className="rs rs-categories">
          <CategoryRulesCard r={r} familyId={familyId} childId={childId} busy={busy} run={run}
            usageByCat={usageTodayByCat} />
        </div>
        <div className="rs rs-apps">
          <AppRulesCard r={r} familyId={familyId} childId={childId} busy={busy} run={run}
            inventory={obs.inventory} usageByPkg={usageTodayByPkg} anchorDay={obs.anchorDay} />
        </div>
      </div>
      <div className="stack">
        <div className="rs rs-instant">
          <InstantControlCard familyId={familyId} childId={childId} devices={obs.devices}
            busy={busy} run={run} commands={r.commands} />
        </div>
        <div className="rs rs-guards">
          <GuardsCard r={r} familyId={familyId} childId={childId} busy={busy} run={run} />
        </div>
        <div className="rs rs-schedules">
          <SchedulesCard r={r} familyId={familyId} childId={childId} busy={busy} run={run} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Limites de temps + préréglages ---------------- */
function TimeLimitsCard({ r, familyId, child, busy, run, usageTodayTotal }: Omit<CardBase, "childId"> & {
  child: Child; usageTodayTotal: number;
}) {
  const { t } = useI18n();
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
    return toResult(error);
  }
  async function setWeekday(d: number, minutes: number | null) {
    if (minutes == null) {
      const { error } = await supabase.from("screen_time_limits")
        .delete().eq("child_id", childId).eq("day_of_week", d);
      return toResult(error);
    }
    const { error } = await supabase.from("screen_time_limits").upsert(
      { family_id: familyId, child_id: childId, day_of_week: d, limit_minutes: minutes },
      { onConflict: "child_id,day_of_week" });
    return toResult(error);
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
      <h2>{t("views.rules.timeLimits.title")}</h2>

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <span className="muted small">{t("views.rules.timeLimits.today")}</span>
        <span style={{ fontWeight: 700 }}>
          {effLimit != null
            ? t("views.rules.timeLimits.usageOfLimit", { used: fmtDuration(usageTodayTotal), limit: fmtDuration(effLimit * 60_000) })
            : fmtDuration(usageTodayTotal)}
        </span>
      </div>
      <Meter value={usageTodayTotal / 60000} max={effLimit ?? Math.max(1, usageTodayTotal / 60000)}
        color={effLimit != null && usageTodayTotal / 60000 > effLimit ? "var(--c-danger)" : "var(--c-accent)"} />
      {bonusToday > 0 && <p className="muted small" style={{ marginTop: 6 }}>{t("views.rules.timeLimits.bonusToday", { minutes: bonusToday })}</p>}

      <h3 style={{ marginTop: 18 }}>{t("views.rules.timeLimits.presetsTitle")}</h3>
      <div className="row" style={{ gap: 8 }}>
        {(Object.keys(AGE_PRESETS) as AgeProfile[]).map((k) => (
          <button key={k} type="button" className="soft" disabled={busy}
            onClick={() => run(() => applyPreset(k))}>{AGE_PRESETS[k].label}</button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        {t("views.rules.timeLimits.presetsHint")}
      </p>

      <h3 style={{ marginTop: 18 }}>{t("views.rules.timeLimits.dailyLimitTitle")}</h3>
      <div className="inline">
        <span className="unit-field">
          <input type="number" inputMode="numeric" min={0} aria-label={t("views.rules.timeLimits.dailyLimitTitle")} placeholder={t("views.rules.timeLimits.dailyLimitPlaceholder")} value={global} style={{ width: 120 }}
            onChange={(e) => setGlobal(e.target.value)} />
          <span aria-hidden="true">{t("views.rules.timeLimits.minutesPerDay")}</span>
        </span>
        <button disabled={busy} onClick={() => run(() =>
          savePolicy({ daily_limit_minutes: global.trim() === "" ? null : Math.max(0, parseInt(global, 10) || 0) }))}>
          {t("views.rules.timeLimits.save")}
        </button>
      </div>

      <h3 style={{ marginTop: 18 }}>{t("views.rules.timeLimits.weekdayTitle")}</h3>
      <div className="weekday-grid">
        {DOW_ORDER.map((d) => (
          <WeekdayLimit key={d} label={DOW_LABELS[d]} value={limitFor(d)} busy={busy}
            onSave={(m) => run(() => setWeekday(d, m))} />
        ))}
      </div>

      <h3 style={{ marginTop: 18 }}>{t("views.rules.timeLimits.graceTitle")}</h3>
      <label className="check">
        <input type="checkbox" checked={policy?.grace_enabled ?? true}
          onChange={(e) => run(() => savePolicy({ grace_enabled: e.target.checked }))} />
        <span>{t("views.rules.timeLimits.graceToggle")}</span>
      </label>
      {(policy?.grace_enabled ?? true) && (
        <div className="inline" style={{ marginTop: 8 }}>
          <label className="fld">{t("views.rules.timeLimits.graceDuration")}
            <input type="number" min={0} max={15} defaultValue={policy?.grace_minutes ?? 1} style={{ width: 80 }}
              onBlur={(e) => run(() => savePolicy({ grace_minutes: Math.min(15, Math.max(0, parseInt(e.target.value, 10) || 0)) }))} />
          </label>
          <label className="fld">{t("views.rules.timeLimits.graceUsesPerDay")}
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
  const { t } = useI18n();
  const [v, setV] = useState(value?.toString() ?? "");
  return (
    <label style={{ alignItems: "center", gap: 4, fontWeight: 500, color: "var(--c-muted)" }}>
      <span>{label}</span>
      <input type="number" inputMode="numeric" min={0} value={v} placeholder={t("common.none")} disabled={busy}
        style={{ width: "100%", textAlign: "center", padding: "0 4px" }}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onSave(v.trim() === "" ? null : Math.max(0, parseInt(v, 10) || 0))} />
    </label>
  );
}

/* ------------------------- Pause / verrouillage instantané --------------- */
function InstantControlCard({ familyId, childId, devices, busy, run, commands }: {
  familyId: string; childId: string; devices: ObservationData["devices"]; busy: boolean;
  run: CardBase["run"]; commands: ReturnType<typeof useRules>["commands"];
}) {
  const { t } = useI18n();
  // Appareils actifs, le plus récent d'abord : c'est lui qui est ciblé par défaut.
  const active = activeDevicesNewestFirst(devices);
  const [deviceId, setDeviceId] = useState<string>(active[0]?.id ?? "");
  const [lockMsg, setLockMsg] = useState("");

  function cmd(type: "lock_now" | "pause" | "resume" | "ring" | "message", payload?: Record<string, unknown>) {
    if (!deviceId) { return; }
    run(() => sendCommand({ familyId, childId, deviceId, type, payload }));
  }

  return (
    <div className="card">
      <h2>{t("views.rules.instantControl.title")}</h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        <Trans k="views.rules.instantControl.intro" tags={{ b: (c) => <b>{c}</b> }} />
      </p>
      {active.length === 0 ? (
        <EmptyState icon={Smartphone} title={t("views.rules.instantControl.noDeviceTitle")}
          hint={t("views.rules.instantControl.noDeviceHint")} />
      ) : (
        <>
          {active.length > 1 && (
            <select aria-label={t("views.rules.instantControl.title")} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} style={{ marginBottom: 10 }}>
              {active.map((d) => <option key={d.id} value={d.id}>{d.label ?? d.model ?? d.platform}</option>)}
            </select>
          )}
          {/* Grille 2×2 régulière : une seule action pleine (Verrouiller). */}
          <div className="grid cols-2 actions-2x2">
            <button disabled={busy} onClick={() => cmd("lock_now")}><Lock {...ic} size={18} />{t("views.rules.instantControl.lock")}</button>
            <button className="ghost" disabled={busy} onClick={() => cmd("pause")}><Pause {...ic} size={18} />{t("views.rules.instantControl.pause")}</button>
            <button className="ghost" disabled={busy} onClick={() => cmd("resume")}><Play {...ic} size={18} />{t("views.rules.instantControl.resume")}</button>
            <button className="ghost" disabled={busy} onClick={() => cmd("ring")}><BellRing {...ic} size={18} />{t("views.rules.instantControl.ring")}</button>
          </div>
          <div className="inline" style={{ marginTop: 12 }}>
            <input aria-label={t("views.rules.instantControl.messagePlaceholder")} aria-describedby="lock-msg-hint"
              placeholder={t("views.rules.instantControl.messagePlaceholder")} value={lockMsg}
              onChange={(e) => setLockMsg(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <button className="ghost" disabled={busy || !lockMsg.trim()}
              onClick={() => { cmd("message", { message: lockMsg.trim() }); setLockMsg(""); }}><Send {...ic} size={18} className="flip-rtl" />{t("views.rules.instantControl.send")}</button>
          </div>
          <p id="lock-msg-hint" className="card-sub" style={{ marginTop: 6 }}>{t("views.rules.instantControl.messageHint")}</p>
        </>
      )}
      {commands.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>{t("views.rules.instantControl.recentCommands")}</h3>
          <ul className="plain">
            {commands.slice(0, 5).map((c) => (
              <li key={c.id} className="row" style={{ gap: 8, fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>
                  {COMMAND_TYPES.includes(c.type) ? t(`views.rules.commandType.${c.type}`) : c.type}
                </span>
                <span className="badge">
                  {COMMAND_STATUSES.includes(c.status) ? t(`views.rules.instantControl.commandStatus.${c.status}`) : c.status}
                </span>
                <span className="muted small" style={{ marginInlineStart: "auto" }}>{fmtDateTime(c.created_at)}</span>
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
  const { t } = useI18n();
  const policy = r.policy;
  async function savePolicy(patch: Partial<AccessPolicy>) {
    const base = toPolicyUpsert(policy, familyId, childId);
    const { error } = await supabase.from("access_policies")
      .upsert({ ...base, ...patch }, { onConflict: "child_id" });
    return toResult(error);
  }
  const vac = isVacationActive(policy);
  return (
    <div className="card">
      <h2>{t("views.rules.guards.title")}</h2>

      <h3>{t("views.rules.guards.vacationTitle")}</h3>
      <p className="muted small" style={{ marginTop: -6 }}>
        {t("views.rules.guards.vacationHint")}
        {vac && <b style={{ color: "var(--warning)" }}>{" · "}{t("views.rules.guards.vacationActive")}</b>}
      </p>
      <div className="inline">
        <label className="fld">{t("views.rules.guards.from")}
          <input type="date" defaultValue={policy?.vacation_from ?? ""}
            onBlur={(e) => run(() => savePolicy({ vacation_from: e.target.value || null }))} />
        </label>
        <label className="fld">{t("views.rules.guards.until")}
          <input type="date" defaultValue={policy?.vacation_until ?? ""}
            onBlur={(e) => run(() => savePolicy({ vacation_until: e.target.value || null }))} />
        </label>
        {(policy?.vacation_from || policy?.vacation_until) && (
          <button className="link" disabled={busy}
            onClick={() => run(() => savePolicy({ vacation_from: null, vacation_until: null }))}>{t("views.rules.guards.clear")}</button>
        )}
      </div>

      <h3 style={{ marginTop: 16 }}>{t("views.rules.guards.installTitle")}</h3>
      <label className="check">
        <input type="checkbox" checked={policy?.block_new_apps ?? false}
          onChange={(e) => run(() => savePolicy({ block_new_apps: e.target.checked }))} />
        <span><Trans k="views.rules.guards.blockNewApps" tags={{ b: (c) => <b>{c}</b> }} /></span>
      </label>

      <h3 style={{ marginTop: 16 }}>{t("views.rules.guards.systemLockTitle")}</h3>
      <label className="check">
        <input type="checkbox" checked={policy?.lock_system_settings ?? false}
          onChange={(e) => run(() => savePolicy({ lock_system_settings: e.target.checked }))} />
        <span>{t("views.rules.guards.systemLockToggle")}</span>
      </label>
      <p className="muted small"><Trans k="views.rules.guards.systemLockHint" tags={{ b: (c) => <b>{c}</b> }} /></p>

      <h3 style={{ marginTop: 16 }}>{t("views.rules.guards.ratingTitle")}</h3>
      <div className="inline">
        <select aria-label={t("views.rules.guards.ratingTitle")} defaultValue={policy?.max_content_rating ?? ""}
          onChange={(e) => run(() => savePolicy({ max_content_rating: e.target.value || null }))}>
          <option value="">{t("views.rules.guards.ratingNone")}</option>
          <option value="PEGI 3">PEGI 3</option>
          <option value="PEGI 7">PEGI 7</option>
          <option value="PEGI 12">PEGI 12</option>
          <option value="PEGI 16">PEGI 16</option>
        </select>
        <span className="muted small">{t("views.rules.guards.ratingHint")}</span>
      </div>
    </div>
  );
}

/* ------------------------- Règles par catégorie -------------------------- */
function CategoryRulesCard({ r, familyId, childId, busy, run, usageByCat }: CardBase & {
  usageByCat: Map<string, number>;
}) {
  const { t } = useI18n();
  const ruleFor = (cat: string) => r.appRules.find((x) => x.target_type === "category" && x.target_value === cat) ?? null;

  async function setCat(cat: string, action: RuleAction | null, limit?: number | null) {
    if (action == null) {
      const existing = ruleFor(cat);
      if (!existing) return { error: null };
      const { error } = await supabase.from("app_rules").delete().eq("id", existing.id);
      return toResult(error);
    }
    const { error } = await supabase.from("app_rules").upsert(
      { family_id: familyId, child_id: childId, target_type: "category", target_value: cat,
        action, daily_limit_minutes: action === "limit" ? (limit ?? 30) : null },
      { onConflict: "child_id,target_type,target_value" });
    return toResult(error);
  }

  return (
    <div className="card">
      <h2>{t("views.rules.categoryRules.title")}</h2>
      <div className="tbl-wrap"><table className="tbl rules-cat">
        <thead><tr>
          <th>{t("views.rules.categoryRules.colCategory")}</th><th>{t("views.rules.categoryRules.colToday")}</th>
          <th>{t("views.rules.categoryRules.colRule")}</th>
        </tr></thead>
        <tbody>
          {CATEGORIES.map((cat) => {
            const rule = ruleFor(cat);
            const ms = usageByCat.get(cat) ?? 0;
            return (
              <tr key={cat}>
                <td><span className="badge"><span className="sw" style={{ background: categoryColor(cat) }} />{categoryLabel(cat)}</span></td>
                <td className="muted small" data-label={t("common.cellLabel", { label: t("views.rules.categoryRules.colToday") })}>
                  {ms > 0 ? fmtDuration(ms) : t("common.none")}</td>
                <td data-label={t("common.cellLabel", { label: t("views.rules.categoryRules.colRule") })}>
                  <span className="rule-cell">
                  <select aria-label={categoryLabel(cat)} value={rule?.action ?? ""} disabled={busy}
                    onChange={(e) => run(() => setCat(cat, (e.target.value || null) as RuleAction | null, rule?.daily_limit_minutes))}>
                    <option value="">{t("views.rules.ruleAction.free")}</option>
                    <option value="limit">{t("views.rules.ruleAction.limit")}</option>
                    <option value="block">{t("views.rules.ruleAction.block")}</option>
                    <option value="always_allow">{t("views.rules.ruleAction.alwaysAllow")}</option>
                  </select>
                  {rule?.action === "limit" && (
                    <span className="unit-field">
                      <input type="number" inputMode="numeric" min={0}
                        aria-label={t("views.rules.categoryRules.colQuota")} defaultValue={rule.daily_limit_minutes ?? 30}
                        onBlur={(e) => run(() => setCat(cat, "limit", Math.max(0, parseInt(e.target.value, 10) || 0)))} />
                      <span aria-hidden="true">{t("views.rules.categoryRules.quotaUnit")}</span>
                    </span>
                  )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </div>
  );
}

/* ------------------------- Règles par application ------------------------ */
function AppRulesCard({ r, familyId, childId, busy, run, inventory, usageByPkg, anchorDay }: CardBase & {
  inventory: ObservationData["inventory"]; usageByPkg: Map<string, number>; anchorDay: string;
}) {
  const { t } = useI18n();
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
      // Même tri que la vue Applications : usage décroissant, puis nom.
      .sort((a, b) => (usageByPkg.get(b.package_name) ?? 0) - (usageByPkg.get(a.package_name) ?? 0)
        || appLabelOf(a.app_label, a.package_name).localeCompare(appLabelOf(b.app_label, b.package_name)));
  }, [inventory, query, onlyRecent, recentCut, usageByPkg]);

  async function setApp(pkg: string, action: RuleAction | null, limit?: number | null) {
    const existing = ruleFor(pkg);
    if (action == null) {
      if (!existing) return { error: null };
      const { error } = await supabase.from("app_rules").delete().eq("id", existing.id);
      return toResult(error);
    }
    const { error } = await supabase.from("app_rules").upsert(
      { family_id: familyId, child_id: childId, target_type: "package", target_value: pkg,
        action, daily_limit_minutes: action === "limit" ? (limit ?? 30) : null },
      { onConflict: "child_id,target_type,target_value" });
    return toResult(error);
  }

  const newCount = inventory.filter((a) => !a.removed_at && a.first_seen_at && a.first_seen_at.slice(0, 10) >= recentCut).length;
  const { visible, button, truncated } = useShowMore(apps);

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>{t("views.rules.appRules.title")}</h2>
      <div className="inline" style={{ marginBottom: 10 }}>
        <input type="search" aria-label={t("views.rules.appRules.searchPlaceholder")} placeholder={t("views.rules.appRules.searchPlaceholder")} value={query}
          onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <label className="check" style={{ paddingBlock: 0, alignItems: "center" }}>
          <input type="checkbox" checked={onlyRecent} onChange={(e) => setOnlyRecent(e.target.checked)} />
          <span className="small">{newCount > 0
            ? <Trans k="views.rules.appRules.newAppsWithCount" params={{ count: newCount }} tags={{ b: (c) => <b>{c}</b> }} />
            : t("views.rules.appRules.newApps")}</span>
        </label>
      </div>
      {apps.length === 0 ? <EmptyState icon={Smartphone} title={t("views.rules.appRules.emptyTitle")}
        hint={t("views.rules.appRules.emptyHint")} /> : (
        <>
        <div className={truncated ? "truncated" : undefined}>
          {visible.map((a) => {
            const rule = ruleFor(a.package_name);
            const ms = usageByPkg.get(a.package_name) ?? 0;
            return (
              <div key={a.id} className="row" style={{ gap: 10, padding: "10px 4px", borderBottom: "1px solid var(--c-divider)" }}>
                <span className="app-ic sm" aria-hidden="true" style={{ "--ic-color": categoryColor(a.category) } as CSSProperties}>
                  {appInitials(a.app_label, a.package_name)}
                </span>
                <span style={{ minWidth: 0, flex: "1 1 160px" }}>
                  <div className="nm" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {appLabelOf(a.app_label, a.package_name)}
                  </div>
                  <div className="muted small">{ms > 0
                    ? t("views.rules.appRules.categoryWithUsage", { category: categoryLabel(a.category), duration: fmtDuration(ms) })
                    : categoryLabel(a.category)}</div>
                </span>
                <span className="rule-cell">
                <select aria-label={appLabelOf(a.app_label, a.package_name)} value={rule?.action ?? ""} disabled={busy}
                  onChange={(e) => run(() => setApp(a.package_name, (e.target.value || null) as RuleAction | null, rule?.daily_limit_minutes))}>
                  <option value="">{t("views.rules.ruleAction.free")}</option>
                  <option value="limit">{t("views.rules.ruleAction.limit")}</option>
                  <option value="block">{t("views.rules.ruleAction.block")}</option>
                  <option value="allow">{t("views.rules.ruleAction.allow")}</option>
                  <option value="always_allow">{t("views.rules.ruleAction.alwaysAllow")}</option>
                </select>
                {rule?.action === "limit" && (
                  <span className="unit-field">
                    <input type="number" inputMode="numeric" min={0}
                      aria-label={t("views.rules.categoryRules.colQuota")} defaultValue={rule.daily_limit_minutes ?? 30}
                      onBlur={(e) => run(() => setApp(a.package_name, "limit", Math.max(0, parseInt(e.target.value, 10) || 0)))} />
                    <span aria-hidden="true">{t("views.rules.categoryRules.quotaUnit")}</span>
                  </span>
                )}
                </span>
              </div>
            );
          })}
        </div>
        {button}
        </>
      )}
    </div>
  );
}

/* ------------------------- Plannings réutilisables ----------------------- */
function SchedulesCard({ r, familyId, childId, busy, run }: CardBase) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ScheduleKind>("downtime");

  const assignedIds = new Set(r.childSchedules.filter((cs) => cs.enabled).map((cs) => cs.schedule_id));

  async function createSchedule() {
    if (!name.trim()) return { error: null };
    const { error } = await supabase.from("schedules")
      .insert({ family_id: familyId, name: name.trim(), kind });
    if (!error) setName("");
    return toResult(error);
  }
  async function toggleAssign(scheduleId: string, on: boolean) {
    if (on) {
      const { error } = await supabase.from("child_schedules").upsert(
        { family_id: familyId, child_id: childId, schedule_id: scheduleId, enabled: true },
        { onConflict: "child_id,schedule_id" });
      return toResult(error);
    }
    const { error } = await supabase.from("child_schedules")
      .delete().eq("child_id", childId).eq("schedule_id", scheduleId);
    return toResult(error);
  }

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2><Trans k="views.rules.schedules.title" tags={{ note: (c) => <span className="muted small">{c}</span> }} /></h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        {t("views.rules.schedules.intro")}
      </p>
      <form className="inline" onSubmit={(e) => { e.preventDefault(); run(createSchedule); }} style={{ marginBottom: 12 }}>
        <div className="fld field-with-hint">
          <input aria-label={t("views.rules.schedules.namePlaceholder")} aria-describedby="schedule-name-hint"
            placeholder={t("views.rules.schedules.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
          <span id="schedule-name-hint" className="field-hint">{t("views.rules.schedules.nameHint")}</span>
        </div>
        <select aria-label={t("views.rules.schedules.kindLabel")} value={kind} onChange={(e) => setKind(e.target.value as ScheduleKind)}>
          {(Object.keys(SCHEDULE_KIND_LABEL) as ScheduleKind[]).map((k) =>
            <option key={k} value={k}>{SCHEDULE_KIND_LABEL[k]}</option>)}
        </select>
        <button disabled={busy || !name.trim()} type="submit"><Plus {...ic} size={18} strokeWidth={2} />{t("views.rules.schedules.addSchedule")}</button>
      </form>

      {r.schedules.length === 0 ? <EmptyState icon={CalendarDays} title={t("views.rules.schedules.emptyTitle")}
        hint={t("views.rules.schedules.emptyHint")} /> : (
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
  const { t } = useI18n();
  const [start, setStart] = useState("21:00");
  const [end, setEnd] = useState("07:00");
  const [mask, setMask] = useState(127);

  async function addWindow() {
    const { error } = await supabase.from("schedule_windows").insert({
      schedule_id: schedule.id, dow_mask: mask,
      start_minute: hhmmToMinutes(start), end_minute: hhmmToMinutes(end),
    });
    return toResult(error);
  }
  async function delWindow(id: string) {
    const { error } = await supabase.from("schedule_windows").delete().eq("id", id);
    return toResult(error);
  }

  return (
    <div style={{ borderTop: "1px solid var(--c-divider)", padding: "14px 0" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <strong>{schedule.name}</strong>{" "}
          <span className="badge">{SCHEDULE_KIND_LABEL[schedule.kind]}</span>
        </div>
        <label className="check" style={{ paddingBlock: 0, alignItems: "center" }}>
          <input type="checkbox" checked={assigned} disabled={busy} onChange={(e) => onToggle(e.target.checked)} />
          <span className="small">{t("views.rules.schedules.assigned")}</span>
        </label>
      </div>

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        {windows.length === 0 && <span className="muted small">{t("views.rules.schedules.noWindows")}</span>}
        {windows.map((w) => (
          <span key={w.id} className="badge sand" style={{ paddingInlineEnd: 2 }}>
            {t("views.rules.schedules.window", {
              days: dowMaskLabel(w.dow_mask), start: minutesToHHMM(w.start_minute), end: minutesToHHMM(w.end_minute),
            })}
            <button type="button" className="icon-btn sm" disabled={busy}
              aria-label={t("views.rules.schedules.removeWindow")} title={t("views.rules.schedules.removeWindow")}
              onClick={() => run(() => delWindow(w.id))}><X {...ic} size={16} /></button>
          </span>
        ))}
      </div>

      <div className="add-window">
        <h4 className="sub-title">{t("views.rules.schedules.addWindowTitle")}</h4>
        <div className="dow-grid">
          {DOW_ORDER.map((d) => (
            <button key={d} type="button" className={dowMaskHas(mask, d) ? "soft on" : "soft"}
              aria-pressed={dowMaskHas(mask, d)}
              style={{ padding: 0, fontSize: 13 }}
              onClick={() => setMask((m) => m ^ dowBit(d))}>{DOW_LABELS[d]}</button>
          ))}
        </div>
        <div className="window-times">
          <label className="fld">{t("views.rules.schedules.fromLabel")}
            <input type="time" aria-label={t("views.rules.schedules.startLabel")} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="fld">{t("views.rules.schedules.toLabel")}
            <input type="time" aria-label={t("views.rules.schedules.endLabel")} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <div className="inline">
          <button className="ghost" disabled={busy || mask === 0} onClick={() => run(addWindow)}><Plus {...ic} size={18} strokeWidth={2} />{t("views.rules.schedules.addWindow")}</button>
        </div>
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
