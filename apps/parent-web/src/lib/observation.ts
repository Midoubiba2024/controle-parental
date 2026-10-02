import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { dayKey } from "./format";
import type {
  AppInventory, CommEvent, Device, DeviceStatus, UsageDaily,
} from "./types";

/* =============================================================================
   Récupération + agrégation des données d'observation (LOT 1) pour un enfant.
   Tout est lu sous RLS (le parent ne voit que sa famille). Agrégats/metadonnées
   uniquement — aucun contenu n'existe en base.
   ============================================================================= */

export interface ObservationData {
  usage: UsageDaily[];
  inventory: AppInventory[];
  status: DeviceStatus[];        // derniers relevés par appareil
  comms: CommEvent[];
  devices: Device[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const USAGE_WINDOW_DAYS = 35;

export function useObservation(childId: string | null): ObservationData {
  const [usage, setUsage] = useState<UsageDaily[]>([]);
  const [inventory, setInventory] = useState<AppInventory[]>([]);
  const [status, setStatus] = useState<DeviceStatus[]>([]);
  const [comms, setComms] = useState<CommEvent[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!childId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const since = dayKey(USAGE_WINDOW_DAYS);

    const [u, inv, st, cm, dv] = await Promise.all([
      supabase.from("usage_daily").select("*")
        .eq("child_id", childId).gte("day", since).order("day", { ascending: false }),
      supabase.from("app_inventory").select("*")
        .eq("child_id", childId).order("last_seen_at", { ascending: false }),
      supabase.from("device_status").select("*")
        .eq("child_id", childId).order("captured_at", { ascending: false }).limit(200),
      supabase.from("comm_events").select("*")
        .eq("child_id", childId).order("occurred_at", { ascending: false }).limit(500),
      supabase.from("devices").select("*").eq("child_id", childId).order("created_at"),
    ]);

    if (u.error) setError(u.error.message); else setUsage(u.data as UsageDaily[]);
    if (!inv.error) setInventory(inv.data as AppInventory[]);
    if (!st.error) setStatus(latestPerDevice(st.data as DeviceStatus[]));
    if (!cm.error) setComms(cm.data as CommEvent[]);
    if (!dv.error) setDevices(dv.data as Device[]);
    setLoading(false);
  }, [childId]);

  useEffect(() => { void load(); }, [load]);

  return { usage, inventory, status, comms, devices, loading, error, reload: load };
}

function latestPerDevice(rows: DeviceStatus[]): DeviceStatus[] {
  const seen = new Set<string>();
  const out: DeviceStatus[] = [];
  for (const r of rows) {           // déjà trié captured_at desc
    if (seen.has(r.device_id)) continue;
    seen.add(r.device_id);
    out.push(r);
  }
  return out;
}

/* --------------------------- Agrégations pures --------------------------- */

export interface AppUsage {
  packageName: string;
  label: string | null;
  category: string | null;
  ms: number;
  launches: number;
}

export function totalForDay(usage: UsageDaily[], day: string): number {
  return usage.filter((u) => u.day === day).reduce((s, u) => s + u.total_foreground_ms, 0);
}

export function totalInRange(usage: UsageDaily[], fromDay: string, toDay: string): number {
  return usage.filter((u) => u.day >= fromDay && u.day <= toDay)
    .reduce((s, u) => s + u.total_foreground_ms, 0);
}

/** Totaux journaliers sur une liste de jours (ordre fourni). */
export function dailyTotals(usage: UsageDaily[], days: string[]): number[] {
  const map = new Map<string, number>();
  for (const u of usage) map.set(u.day, (map.get(u.day) ?? 0) + u.total_foreground_ms);
  return days.map((d) => map.get(d) ?? 0);
}

/** Répartition par catégorie sur un intervalle de jours. */
export function byCategory(usage: UsageDaily[], fromDay: string, toDay: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const u of usage) {
    if (u.day < fromDay || u.day > toDay) continue;
    const cat = u.category ?? "other";
    map.set(cat, (map.get(cat) ?? 0) + u.total_foreground_ms);
  }
  return map;
}

/** Usage agrégé par app (tous appareils) sur un intervalle. Trié décroissant. */
export function byApp(usage: UsageDaily[], fromDay: string, toDay: string): AppUsage[] {
  const map = new Map<string, AppUsage>();
  for (const u of usage) {
    if (u.day < fromDay || u.day > toDay) continue;
    const cur = map.get(u.package_name) ?? {
      packageName: u.package_name, label: u.app_label, category: u.category, ms: 0, launches: 0,
    };
    cur.ms += u.total_foreground_ms;
    cur.launches += u.launch_count;
    if (!cur.label && u.app_label) cur.label = u.app_label;
    if (!cur.category && u.category) cur.category = u.category;
    map.set(u.package_name, cur);
  }
  return [...map.values()].sort((a, b) => b.ms - a.ms);
}

/** Variation en % entre deux valeurs (null si base nulle). */
export function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
