import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { errorMessage, labelMap, t } from "../i18n";
import type {
  Device, Geofence, GeofenceEvent, LocationFix, LocationSettings,
  SafetyAlert, SosEvent,
} from "./types";

/* =============================================================================
   LOT 3 — Chargement des données de LOCALISATION & SÉCURITÉ pour un enfant.
   Tout est lu sous RLS (le parent ne voit que sa famille ; l'enfant voit SES
   données côté app → transparence). Positions de NOTRE app uniquement, jamais
   occultes. La diffusion SOS en direct (E2) passe par Supabase Realtime : on
   fusionne les nouveaux relevés/épisodes poussés par le canal, le polling restant
   le socle de repli.
   ============================================================================= */

export interface LocationData {
  settings: LocationSettings | null;
  fixes: LocationFix[];            // relevés récents (captured_at desc)
  geofences: Geofence[];
  events: GeofenceEvent[];         // transitions récentes
  sos: SosEvent[];                 // épisodes SOS récents
  alerts: SafetyAlert[];           // alertes (batterie faible…)
  devices: Device[];
  loading: boolean;
  error: string | null;
  live: boolean;                   // le canal Realtime est-il connecté ?
  reload: () => void;
}

// Nombre maximum de relevés chargés (historique + live). Au-delà, la fenêtre de
// rétention (location_settings.retention_days) borne déjà la base ; on plafonne
// l'affichage pour ne pas saturer la carte.
const FIX_LIMIT = 1000;

export function useLocation(childId: string | null): LocationData {
  const [settings, setSettings] = useState<LocationSettings | null>(null);
  const [fixes, setFixes] = useState<LocationFix[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [events, setEvents] = useState<GeofenceEvent[]>([]);
  const [sos, setSos] = useState<SosEvent[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // Évite d'empiler les réponses périmées quand l'enfant sélectionné change.
  const childRef = useRef<string | null>(childId);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    childRef.current = childId;
    if (!childId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    void (async () => {
      const [se, fx, gf, ev, so, al, dv] = await Promise.all([
        supabase.from("location_settings").select("*").eq("child_id", childId).maybeSingle(),
        supabase.from("location_fixes").select("*").eq("child_id", childId)
          .order("captured_at", { ascending: false }).limit(FIX_LIMIT),
        supabase.from("geofences").select("*").eq("child_id", childId).order("created_at"),
        supabase.from("geofence_events").select("*").eq("child_id", childId)
          .order("occurred_at", { ascending: false }).limit(200),
        supabase.from("sos_events").select("*").eq("child_id", childId)
          .order("started_at", { ascending: false }).limit(50),
        supabase.from("safety_alerts").select("*").eq("child_id", childId)
          .order("created_at", { ascending: false }).limit(100),
        supabase.from("devices").select("*").eq("child_id", childId).order("created_at"),
      ]);

      if (!active) return;   // sélection changée → on jette ce résultat (vie privée)

      // location_settings : une erreur réseau ne doit pas écraser un réglage connu.
      if (se.error) setError(errorMessage(se.error)); else setSettings((se.data as LocationSettings) ?? null);
      if (!fx.error) setFixes(fx.data as LocationFix[]);
      if (!gf.error) setGeofences(gf.data as Geofence[]);
      if (!ev.error) setEvents(ev.data as GeofenceEvent[]);
      if (!so.error) setSos(so.data as SosEvent[]);
      if (!al.error) setAlerts(al.data as SafetyAlert[]);
      if (!dv.error) setDevices(dv.data as Device[]);
      setLoading(false);
    })();

    return () => { active = false; };
  }, [childId, reloadToken]);

  // --- Realtime : diffusion live du SOS (E2) + nouveaux relevés/épisodes --------
  useEffect(() => {
    if (!childId) return;
    setLive(false);
    const channel = supabase
      .channel(`loc:${childId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "location_fixes", filter: `child_id=eq.${childId}` },
        (payload) => {
          if (childRef.current !== childId) return;
          const row = payload.new as LocationFix;
          setFixes((cur) => (cur.some((f) => f.id === row.id)
            ? cur
            : [row, ...cur].slice(0, FIX_LIMIT)));
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "sos_events", filter: `child_id=eq.${childId}` },
        (payload) => {
          if (childRef.current !== childId) return;
          const row = payload.new as SosEvent;
          setSos((cur) => {
            const rest = cur.filter((s) => s.id !== row.id);
            return [row, ...rest].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 50);
          });
        })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "geofence_events", filter: `child_id=eq.${childId}` },
        (payload) => {
          if (childRef.current !== childId) return;
          const row = payload.new as GeofenceEvent;
          setEvents((cur) => (cur.some((e) => e.id === row.id) ? cur : [row, ...cur].slice(0, 200)));
        })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "safety_alerts", filter: `child_id=eq.${childId}` },
        (payload) => {
          if (childRef.current !== childId) return;
          const row = payload.new as SafetyAlert;
          setAlerts((cur) => (cur.some((a) => a.id === row.id) ? cur : [row, ...cur].slice(0, 100)));
        })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => { void supabase.removeChannel(channel); };
  }, [childId]);

  return { settings, fixes, geofences, events, sos, alerts, devices, loading, error, live, reload };
}

/* ----------------------------- Mutations -------------------------------- */

/** Crée ou met à jour le réglage de partage de position de l'enfant. */
export async function saveLocationSettings(
  familyId: string, childId: string, patch: Partial<LocationSettings>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("location_settings").upsert(
    { family_id: familyId, child_id: childId, ...patch },
    { onConflict: "child_id" });
  return { error: error ? errorMessage(error) : null };
}

export interface GeofenceInput {
  id?: string;
  name: string;
  type: Geofence["type"];
  center_lat: number;
  center_lng: number;
  radius_m: number;
  enabled?: boolean;
  notify_enter?: boolean;
  notify_exit?: boolean;
}

/** Crée/met à jour une zone de sécurité (geofence). */
export async function saveGeofence(
  familyId: string, childId: string, g: GeofenceInput,
): Promise<{ error: string | null }> {
  const row = {
    ...(g.id ? { id: g.id } : {}),
    family_id: familyId, child_id: childId,
    name: g.name, type: g.type,
    center_lat: g.center_lat, center_lng: g.center_lng, radius_m: g.radius_m,
    enabled: g.enabled ?? true,
    notify_enter: g.notify_enter ?? true,
    notify_exit: g.notify_exit ?? false,
  };
  const { error } = await supabase.from("geofences").upsert(row);
  return { error: error ? errorMessage(error) : null };
}

export async function deleteGeofence(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("geofences").delete().eq("id", id);
  return { error: error ? errorMessage(error) : null };
}

/** Demande un check-in de position ponctuel (D2) via une commande 'locate'. */
export async function requestLocate(
  familyId: string, childId: string, deviceId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("commands").insert({
    family_id: familyId, child_id: childId, device_id: deviceId,
    type: "locate", payload: {},
  });
  return { error: error ? errorMessage(error) : null };
}

/** Accuse réception d'un SOS (« aide en route », E6). */
export async function ackSos(sosId: string): Promise<{ error: string | null }> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("sos_events")
    .update({ status: "acked", acked_at: new Date().toISOString(), acked_by: u.user?.id ?? null })
    .eq("id", sosId);
  return { error: error ? errorMessage(error) : null };
}

/** Clôture un épisode SOS (côté parent). */
export async function resolveSos(sosId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("sos_events")
    .update({ status: "resolved", ended_at: new Date().toISOString() })
    .eq("id", sosId);
  return { error: error ? errorMessage(error) : null };
}

/** Marque une alerte de sécurité comme vue. */
export async function acknowledgeAlert(alertId: string): Promise<{ error: string | null }> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("safety_alerts")
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: u.user?.id ?? null })
    .eq("id", alertId);
  return { error: error ? errorMessage(error) : null };
}

/* ----------------------------- Helpers ---------------------------------- */

export const GEOFENCE_TYPE_LABEL: Readonly<Record<Geofence["type"], string>> = labelMap(
  ["home", "school", "custom"], (k) => t(`enums.geofenceType.${k}`));

export const GEOFENCE_TRANSITION_LABEL: Readonly<Record<GeofenceEvent["transition"], string>> = labelMap(
  ["enter", "exit", "dwell"], (k) => t(`enums.geofenceTransition.${k}`));

export const LOCATION_MODE_LABEL: Readonly<Record<LocationSettings["mode"], string>> = labelMap(
  ["off", "on_demand", "periodic"], (k) => t(`enums.locationMode.${k}`));

/** Marqueur d'un épisode SOS actif (non clos) dans la liste. */
export function activeSos(sos: SosEvent[]): SosEvent | null {
  return sos.find((s) => s.status === "active" || s.status === "acked") ?? null;
}

/** Zone de confiance → couleur de la palette de graphiques Cocon (identité aussi
 *  portée par l'icône + le libellé, jamais par la couleur seule). La maison n'utilise
 *  PAS --series-1 (corail, trop proche de l'accent et du marqueur SOS). */
export function geofenceColor(type: Geofence["type"]): string {
  switch (type) {
    case "home": return "var(--series-2)";    // vert d'eau
    case "school": return "var(--series-5)";  // bleu
    default: return "var(--series-3)";        // prune
  }
}
