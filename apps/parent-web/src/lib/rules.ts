import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { dayKey } from "./format";
import type {
  AccessPolicy, AccessRequest, AgeProfile, AppRule, ChildSchedule, Command,
  Schedule, ScheduleWindow, ScreenTimeLimit, TimeGrant,
} from "./types";

/* =============================================================================
   LOT 2 — Chargement + agrégation des RÈGLES D'ACCÈS pour un enfant.
   Tout est lu sous RLS (le parent écrit/lit sa famille ; l'enfant lit ses
   règles côté app → transparence). Aucune donnée de contenu ici : uniquement
   des réglages (limites, blocages, plannings, bonus).
   ============================================================================= */

export interface RulesData {
  policy: AccessPolicy | null;
  limits: ScreenTimeLimit[];
  appRules: AppRule[];
  schedules: Schedule[];           // plannings de la famille (réutilisables)
  windows: ScheduleWindow[];       // fenêtres de ces plannings
  childSchedules: ChildSchedule[]; // assignations pour cet enfant
  grantsToday: TimeGrant[];        // bonus du jour
  commands: Command[];             // dernières commandes (statut)
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useRules(familyId: string | null, childId: string | null): RulesData {
  const [policy, setPolicy] = useState<AccessPolicy | null>(null);
  const [limits, setLimits] = useState<ScreenTimeLimit[]>([]);
  const [appRules, setAppRules] = useState<AppRule[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [windows, setWindows] = useState<ScheduleWindow[]>([]);
  const [childSchedules, setChildSchedules] = useState<ChildSchedule[]>([]);
  const [grantsToday, setGrantsToday] = useState<TimeGrant[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!familyId || !childId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const today = dayKey(0);

    const [pol, lim, ar, sch, cs, gr, cmd] = await Promise.all([
      supabase.from("access_policies").select("*").eq("child_id", childId).maybeSingle(),
      supabase.from("screen_time_limits").select("*").eq("child_id", childId),
      supabase.from("app_rules").select("*").eq("child_id", childId).order("created_at"),
      supabase.from("schedules").select("*").eq("family_id", familyId).order("created_at"),
      supabase.from("child_schedules").select("*").eq("child_id", childId),
      supabase.from("time_grants").select("*").eq("child_id", childId).eq("grant_date", today),
      supabase.from("commands").select("*").eq("child_id", childId)
        .order("created_at", { ascending: false }).limit(20),
    ]);

    if (pol.error) setError(pol.error.message); else setPolicy((pol.data as AccessPolicy) ?? null);
    if (!lim.error) setLimits(lim.data as ScreenTimeLimit[]);
    if (!ar.error) setAppRules(ar.data as AppRule[]);
    if (!cs.error) setChildSchedules(cs.data as ChildSchedule[]);
    if (!gr.error) setGrantsToday(gr.data as TimeGrant[]);
    if (!cmd.error) setCommands(cmd.data as Command[]);

    const scheduleList = (sch.error ? [] : (sch.data as Schedule[]));
    setSchedules(scheduleList);
    // Fenêtres de tous les plannings de la famille (une seule requête).
    if (scheduleList.length > 0) {
      const ids = scheduleList.map((s) => s.id);
      const w = await supabase.from("schedule_windows").select("*").in("schedule_id", ids);
      if (!w.error) setWindows(w.data as ScheduleWindow[]);
    } else {
      setWindows([]);
    }

    setLoading(false);
  }, [familyId, childId]);

  useEffect(() => { void load(); }, [load]);

  return {
    policy, limits, appRules, schedules, windows, childSchedules, grantsToday,
    commands, loading, error, reload: load,
  };
}

/* --------------------------- Jours de la semaine ------------------------- */
// Ordre d'affichage lundi→dimanche, mais indices 0=dimanche … 6=samedi (aligné
// JS Date.getDay() et sur le bitmask dow_mask de schedule_windows).
export const DOW_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // affichage semaine FR

export function dowBit(day: number): number { return 1 << day; }
export function dowMaskHas(mask: number, day: number): boolean { return (mask & dowBit(day)) !== 0; }

export function dowMaskLabel(mask: number): string {
  if (mask === 127) return "Tous les jours";
  if (mask === 0b0111110) return "En semaine";      // lun→ven
  if (mask === 0b1000001) return "Week-end";        // sam+dim
  return DOW_ORDER.filter((d) => dowMaskHas(mask, d)).map((d) => DOW_LABELS[d]).join(", ");
}

/* --------------------------- Minutes ↔ HH:MM ----------------------------- */
export function minutesToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10) || 0);
  return (h * 60 + m) % 1440;
}

/* --------------------------- Préréglages par âge (V6) -------------------- */
// Repères indicatifs d'aide à la décision (A11) — ajustables par le parent.
export interface AgePreset {
  label: string;
  dailyMinutes: number;      // limite quotidienne globale conseillée
  weekendMinutes: number;    // samedi & dimanche
  bedtime: { start: string; end: string }; // Downtime conseillé
  categoryLimits: { category: string; minutes: number }[];
}

export const AGE_PRESETS: Record<AgeProfile, AgePreset> = {
  young_child: {
    label: "Jeune enfant (~6 ans)",
    dailyMinutes: 45,
    weekendMinutes: 60,
    bedtime: { start: "19:30", end: "07:00" },
    categoryLimits: [
      { category: "game", minutes: 20 },
      { category: "video", minutes: 20 },
    ],
  },
  preteen: {
    label: "Pré-ado (~12 ans)",
    dailyMinutes: 90,
    weekendMinutes: 150,
    bedtime: { start: "21:00", end: "07:00" },
    categoryLimits: [
      { category: "game", minutes: 45 },
      { category: "social", minutes: 30 },
      { category: "video", minutes: 45 },
    ],
  },
  teen: {
    label: "Ado (15 ans+)",
    dailyMinutes: 150,
    weekendMinutes: 240,
    bedtime: { start: "22:30", end: "06:45" },
    categoryLimits: [
      { category: "social", minutes: 60 },
      { category: "game", minutes: 60 },
    ],
  },
};

/* --------------------------- Limite effective du jour -------------------- */
// Limite du jour = (limite du jour de semaine, sinon défaut global) + bonus
// globaux du jour. null = aucune limite globale.
export function effectiveDailyLimit(
  policy: AccessPolicy | null,
  limits: ScreenTimeLimit[],
  grantsToday: TimeGrant[],
  date = new Date(),
): number | null {
  const dow = date.getDay();
  const perDay = limits.find((l) => l.day_of_week === dow);
  const base = perDay
    ? perDay.limit_minutes
    : (policy?.daily_limit_minutes ?? null);
  if (base == null) return null;
  const bonus = grantsToday
    .filter((g) => g.scope_package == null)
    .reduce((s, g) => s + g.bonus_minutes, 0);
  return base + bonus;
}

export function isVacationActive(policy: AccessPolicy | null): boolean {
  if (!policy?.vacation_from || !policy?.vacation_until) return false;
  const today = dayKey(0);
  return policy.vacation_from <= today && today <= policy.vacation_until;
}

/* --------------------------- Envoi d'une commande ------------------------ */
export async function sendCommand(
  args: {
    familyId: string; childId: string; deviceId: string;
    type: Command["type"]; payload?: Record<string, unknown>;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("commands").insert({
    family_id: args.familyId, child_id: args.childId, device_id: args.deviceId,
    type: args.type, payload: args.payload ?? {},
  });
  return { error: error?.message ?? null };
}

export const SCHEDULE_KIND_LABEL: Record<Schedule["kind"], string> = {
  downtime: "Downtime / coucher",
  allowed: "Plages autorisées",
  blocked: "Plages interdites",
  school: "Mode École",
};

export const REQUEST_KIND_LABEL: Record<AccessRequest["kind"], string> = {
  extra_time: "Temps supplémentaire",
  unblock_app: "Débloquer une app",
  reward: "Récompense",
};
