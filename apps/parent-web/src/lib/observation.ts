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
  // Jour de référence (« aujourd'hui ») dérivé des DONNÉES (dernier jour présent
  // dans usage_daily), écrit dans le fuseau de l'APPAREIL enfant. On ne recalcule
  // pas « aujourd'hui » dans le fuseau du navigateur parent (familles multi-fuseaux).
  anchorDay: string;            // YYYY-MM-DD
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Fenêtre de récupération du temps d'écran. Doit couvrir DEUX périodes de
// comparaison consécutives pour que le delta « vs période précédente » soit
// correct : la plus longue période affichée est 30 j, et la vue compare les
// 30 derniers jours aux 30 jours d'avant → il faut au moins 60 jours de données
// en base (on prend 65 pour une petite marge). Sinon prevTotal serait quasi vide
// et le delta faux.
const USAGE_WINDOW_DAYS = 65;

export function useObservation(childId: string | null): ObservationData {
  const [usage, setUsage] = useState<UsageDaily[]>([]);
  const [inventory, setInventory] = useState<AppInventory[]>([]);
  const [status, setStatus] = useState<DeviceStatus[]>([]);
  const [comms, setComms] = useState<CommEvent[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [anchorDay, setAnchorDay] = useState<string>(dayKey(0));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    // Garde anti-réponse-périmée (VIE PRIVÉE) : si l'enfant sélectionné change
    // avant la fin du chargement, on ignore la réponse de l'enfant précédent pour
    // ne JAMAIS afficher ses données sous l'entête d'un autre enfant.
    let active = true;
    if (!childId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const since = dayKey(USAGE_WINDOW_DAYS);

    void (async () => {
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

      if (!active) return;   // sélection changée entre-temps → on jette ce résultat

      if (u.error) {
        setError(u.error.message);
      } else {
        const rows = u.data as UsageDaily[];
        setUsage(rows);
        // Ancre = dernier jour présent (données ordonnées day desc) ; repli sur le
        // jour navigateur si aucune donnée. Jamais recalculé en TZ navigateur.
        setAnchorDay(rows[0]?.day ?? dayKey(0));
      }
      if (!inv.error) setInventory(inv.data as AppInventory[]);
      if (!st.error) setStatus(latestPerDevice(st.data as DeviceStatus[]));
      if (!cm.error) setComms(cm.data as CommEvent[]);
      if (!dv.error) setDevices(dv.data as Device[]);
      setLoading(false);
    })();

    return () => { active = false; };
  }, [childId, reloadToken]);

  return { usage, inventory, status, comms, devices, anchorDay, loading, error, reload };
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
