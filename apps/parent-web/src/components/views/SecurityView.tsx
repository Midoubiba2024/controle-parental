import { useState } from "react";
import {
  useLocation, saveGeofence, deleteGeofence, saveLocationSettings,
  ackSos, resolveSos, acknowledgeAlert, GEOFENCE_TYPE_LABEL, geofenceColor,
} from "../../lib/location";
import { fmtAgo, fmtDateTime } from "../../lib/format";
import { EmptyState } from "../Ui";
import { MapCanvas, type MapCircle, type MapMarker } from "../map/MapCanvas";
import type { Child, Geofence, GeofenceType, LocationMode, SosEvent } from "../../lib/types";

/* =============================================================================
   LOT 3 — Vue « Sécurité / SOS » : épisodes SOS (position live, accusé « aide en
   route » E6), alertes de sécurité (batterie faible D7), édition des zones de
   sécurité (geofences D4/D5) et réglage du partage de position (graduation âge).
   ============================================================================= */

export function SecurityView({ familyId, child }: { familyId: string; child: Child }) {
  const loc = useLocation(child.id);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(fn: () => Promise<{ error: string | null }>) {
    setMsg(null);
    const { error } = await fn();
    if (error) setMsg(error); else loc.reload();
  }

  if (loc.loading) return <p className="muted">Chargement…</p>;

  const openSos = loc.sos.filter((s) => s.status !== "resolved");

  return (
    <div className="grid" style={{ gap: 18 }}>
      {loc.error && <p className="msg error">{loc.error}</p>}
      {msg && <p className="msg error">{msg}</p>}

      {openSos.map((s) => <SosBanner key={s.id} sos={s} loc={loc} run={run} />)}

      <SettingsCard familyId={familyId} child={child} loc={loc} run={run} />

      <ZonesCard familyId={familyId} child={child} loc={loc} run={run} />

      <AlertsCard loc={loc} run={run} />

      <div className="card">
        <h2>Historique SOS</h2>
        {loc.sos.length === 0 ? (
          <EmptyState icon="🆘" title="Aucun SOS"
            hint="Le bouton SOS est déclenché par l'enfant depuis son application. Un épisode apparaît ici avec sa position en direct." />
        ) : (
          <table className="tbl">
            <thead><tr><th>Statut</th><th>Début</th><th>Fin</th></tr></thead>
            <tbody>
              {loc.sos.map((s) => (
                <tr key={s.id}>
                  <td><span className={`pill ${s.status === "resolved" ? "" : "blocked"}`}>{sosStatusLabel(s)}</span></td>
                  <td className="muted">{fmtDateTime(s.started_at)}</td>
                  <td className="muted">{s.ended_at ? fmtDateTime(s.ended_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function sosStatusLabel(s: SosEvent): string {
  return s.status === "active" ? "Actif" : s.status === "acked" ? "Aide en route" : "Clos";
}

/* ------------------------------ Bandeau SOS actif ----------------------- */
function SosBanner({ sos, loc, run }: {
  sos: SosEvent;
  loc: ReturnType<typeof useLocation>;
  run: (fn: () => Promise<{ error: string | null }>) => void;
}) {
  // Positions diffusées pendant CET épisode (source sos, après son démarrage).
  const liveFixes = loc.fixes
    .filter((f) => f.source === "sos" && f.captured_at >= sos.started_at)
    .slice().sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  // Vraie position SOS si disponible ; sinon on affiche, EN NEUTRE, la dernière
  // position connue AVANT le SOS (ne jamais la faire passer pour une position SOS).
  const liveHead = liveFixes[liveFixes.length - 1] ?? null;
  const head = liveHead ?? loc.fixes[0] ?? null;
  const isLive = liveHead != null;

  const markers: MapMarker[] = head
    ? [{
        id: `sos-${head.id}`, lat: head.latitude, lng: head.longitude,
        color: isLive ? "var(--danger)" : "var(--muted)",
        kind: isLive ? "sos" : "position",
        label: isLive
          ? `Position SOS · ${fmtDateTime(head.captured_at)}`
          : `Dernière position connue avant le SOS · ${fmtDateTime(head.captured_at)}`,
      }]
    : [];
  const path = liveFixes.map((f) => ({ lat: f.latitude, lng: f.longitude }));

  return (
    <div className="card sos-banner">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><span className="dot-pulse" /><strong style={{ fontSize: "1.05rem" }}>SOS — {sosStatusLabel(sos)}</strong>
          <div className="muted small">Déclenché {fmtAgo(sos.started_at)} · {fmtDateTime(sos.started_at)}
            {sos.message ? ` · « ${sos.message} »` : ""}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {sos.status === "active" && (
            <button onClick={() => run(() => ackSos(sos.id))} title="Prévenir l'enfant que l'aide arrive">
              ✅ Aide en route
            </button>
          )}
          <button className="ghost" onClick={() => run(() => resolveSos(sos.id))}>Clôturer</button>
        </div>
      </div>
      {head ? (
        <div style={{ marginTop: 12 }}>
          <MapCanvas markers={markers} path={path} height={300} />
          <p className="muted small" style={{ marginBottom: 0 }}>
            {isLive
              ? `Dernière position SOS ${fmtAgo(head.captured_at)} · ±${Math.round(head.accuracy_m ?? 0)} m${loc.live ? " · diffusion en direct" : ""}`
              : `Pas encore de position SOS — dernière position connue ${fmtAgo(head.captured_at)} · ±${Math.round(head.accuracy_m ?? 0)} m`}
          </p>
        </div>
      ) : (
        <p className="muted small" style={{ marginBottom: 0 }}>En attente de la première position de l'appareil…</p>
      )}
    </div>
  );
}

/* ------------------------------ Réglage du partage ---------------------- */
function SettingsCard({ familyId, child, loc, run }: {
  familyId: string; child: Child;
  loc: ReturnType<typeof useLocation>;
  run: (fn: () => Promise<{ error: string | null }>) => void;
}) {
  const s = loc.settings;
  const mode: LocationMode = s?.mode ?? "on_demand";
  // Repère par âge : jeune enfant → périodique OK ; (pré)ado → privilégier le
  // check-in à la demande (CNIL : autonomie croissante, moins intrusif).
  const suggestPeriodic = child.age_profile === "young_child";

  return (
    <div className="card">
      <h2>Partage de position <span className="muted small">(adapté à l'âge)</span></h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        {suggestPeriodic
          ? "Profil jeune enfant : le suivi périodique est adapté. Il reste visible de l'enfant (notification permanente)."
          : "Profil (pré)ado : privilégiez le check-in à la demande — plus respectueux de l'autonomie. L'enfant voit chaque partage."}
      </p>
      <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
        <label className="fld">
          Mode de partage
          <select value={mode} onChange={(e) =>
            run(() => saveLocationSettings(familyId, child.id, { mode: e.target.value as LocationMode }))}>
            <option value="off">Désactivé</option>
            <option value="on_demand">À la demande (check-in){!suggestPeriodic ? " — conseillé" : ""}</option>
            <option value="periodic">Périodique (suivi de fond){suggestPeriodic ? " — conseillé" : ""}</option>
          </select>
        </label>

        {mode === "periodic" && (
          <label className="fld">
            Fréquence
            <select value={s?.periodic_interval_sec ?? 900} onChange={(e) =>
              run(() => saveLocationSettings(familyId, child.id, { periodic_interval_sec: Number(e.target.value) }))}>
              <option value={300}>Toutes les 5 min</option>
              <option value={900}>Toutes les 15 min</option>
              <option value={1800}>Toutes les 30 min</option>
              <option value={3600}>Toutes les heures</option>
            </select>
          </label>
        )}

        <label className="fld">
          Conservation
          <select value={s?.retention_days ?? 30} onChange={(e) =>
            run(() => saveLocationSettings(familyId, child.id, { retention_days: Number(e.target.value) }))}>
            <option value={7}>7 jours</option>
            <option value={30}>30 jours</option>
            <option value={90}>90 jours</option>
          </select>
        </label>

        <label className="fld">
          Précision
          <select value={s?.high_accuracy ? "high" : "balanced"} onChange={(e) =>
            run(() => saveLocationSettings(familyId, child.id, { high_accuracy: e.target.value === "high" }))}>
            <option value="balanced">Équilibrée (moins de batterie)</option>
            <option value="high">Haute (GPS précis)</option>
          </select>
        </label>
      </div>
    </div>
  );
}

/* ------------------------------ Zones de sécurité ----------------------- */
function ZonesCard({ familyId, child, loc, run }: {
  familyId: string; child: Child;
  loc: ReturnType<typeof useLocation>;
  run: (fn: () => Promise<{ error: string | null }>) => void;
}) {
  const [editing, setEditing] = useState<Geofence | "new" | null>(null);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Zones de sécurité <span className="muted small">(maison, école…)</span></h2>
        {editing === null && <button onClick={() => setEditing("new")}>+ Ajouter une zone</button>}
      </div>

      {editing !== null ? (
        <ZoneForm
          familyId={familyId} child={child} loc={loc}
          zone={editing === "new" ? null : editing}
          onDone={() => { setEditing(null); loc.reload(); }}
          onCancel={() => setEditing(null)}
        />
      ) : loc.geofences.length === 0 ? (
        <EmptyState icon="🏠" title="Aucune zone définie"
          hint="Ajoutez la maison et l'école pour recevoir une alerte « bien arrivé » lors des trajets." />
      ) : (
        <div>
          {loc.geofences.map((g) => (
            <div className="list-row" key={g.id}>
              <span className="zone-tag">
                <span className="zone-sw" style={{ background: geofenceColor(g.type) }} />
                {GEOFENCE_TYPE_LABEL[g.type]}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div className="muted small">
                  rayon {g.radius_m} m · {g.notify_enter ? "alerte arrivée" : ""}
                  {g.notify_enter && g.notify_exit ? " + " : ""}{g.notify_exit ? "alerte départ" : ""}
                  {!g.enabled && " · désactivée"}
                </div>
              </div>
              <button className="ghost" onClick={() =>
                run(() => saveGeofence(familyId, child.id, {
                  id: g.id, name: g.name, type: g.type, center_lat: g.center_lat,
                  center_lng: g.center_lng, radius_m: g.radius_m, enabled: !g.enabled,
                  notify_enter: g.notify_enter, notify_exit: g.notify_exit,
                }))}>
                {g.enabled ? "Désactiver" : "Activer"}
              </button>
              <button className="ghost" onClick={() => setEditing(g)}>Modifier</button>
              <button className="link" onClick={() => { if (confirm(`Supprimer « ${g.name} » ?`)) run(() => deleteGeofence(g.id)); }}>
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ZoneForm({ familyId, child, loc, zone, onDone, onCancel }: {
  familyId: string; child: Child;
  loc: ReturnType<typeof useLocation>;
  zone: Geofence | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const last = loc.fixes[0];
  const [name, setName] = useState(zone?.name ?? "");
  const [type, setType] = useState<GeofenceType>(zone?.type ?? "home");
  const [lat, setLat] = useState<number>(zone?.center_lat ?? last?.latitude ?? 48.8566);
  const [lng, setLng] = useState<number>(zone?.center_lng ?? last?.longitude ?? 2.3522);
  const [radius, setRadius] = useState<number>(zone?.radius_m ?? 150);
  const [notifyEnter, setNotifyEnter] = useState(zone?.notify_enter ?? true);
  const [notifyExit, setNotifyExit] = useState(zone?.notify_exit ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const circles: MapCircle[] = [{ id: "edit", lat, lng, radiusM: radius, color: geofenceColor(type) }];
  const markers: MapMarker[] = [{ id: "center", lat, lng, color: geofenceColor(type), kind: "position", label: "Centre de la zone" }];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await saveGeofence(familyId, child.id, {
      id: zone?.id, name: name.trim(), type, center_lat: lat, center_lng: lng,
      radius_m: radius, enabled: zone?.enabled ?? true, notify_enter: notifyEnter, notify_exit: notifyExit,
    });
    setBusy(false);
    if (error) setErr(error); else onDone();
  }

  return (
    <form onSubmit={submit}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Cliquez sur la carte pour placer le centre de la zone, puis ajustez le rayon.
      </p>
      <MapCanvas markers={markers} circles={circles} height={300}
        onClick={(la, ln) => { setLat(Number(la.toFixed(6))); setLng(Number(ln.toFixed(6))); }} />
      <div className="row" style={{ gap: 14, marginTop: 14, alignItems: "flex-end" }}>
        <label className="fld" style={{ flex: 1, minWidth: 160 }}>
          Nom
          <input value={name} required placeholder="Maison, École…" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="fld">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as GeofenceType)}>
            <option value="home">Maison</option>
            <option value="school">École</option>
            <option value="custom">Autre lieu</option>
          </select>
        </label>
        <label className="fld">
          Rayon : {radius} m
          <input type="range" min={80} max={2000} step={10} value={radius}
            onChange={(e) => setRadius(Number(e.target.value))} />
        </label>
      </div>
      <div className="row" style={{ gap: 18, marginTop: 10 }}>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={notifyEnter} onChange={(e) => setNotifyEnter(e.target.checked)} />
          Alerte « bien arrivé »
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={notifyExit} onChange={(e) => setNotifyExit(e.target.checked)} />
          Alerte au départ
        </label>
      </div>
      <div className="muted small" style={{ marginTop: 8 }}>
        Centre : {lat.toFixed(5)}, {lng.toFixed(5)}
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button type="submit" disabled={busy || !name.trim()}>{busy ? "…" : zone ? "Enregistrer" : "Créer la zone"}</button>
        <button type="button" className="ghost" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

/* ------------------------------ Alertes de sécurité --------------------- */
function AlertsCard({ loc, run }: {
  loc: ReturnType<typeof useLocation>;
  run: (fn: () => Promise<{ error: string | null }>) => void;
}) {
  const unseen = loc.alerts.filter((a) => !a.acknowledged_at);
  if (loc.alerts.length === 0) return null;
  return (
    <div className="card">
      <h2>Alertes de sécurité <span className="muted small">({unseen.length} non vue{unseen.length > 1 ? "s" : ""})</span></h2>
      <table className="tbl">
        <thead><tr><th>Alerte</th><th>Quand</th><th></th></tr></thead>
        <tbody>
          {loc.alerts.slice(0, 20).map((a) => (
            <tr key={a.id}>
              <td>🔋 Batterie faible{a.battery_level != null ? ` (${a.battery_level}%)` : ""}</td>
              <td className="muted">{fmtDateTime(a.created_at)} · {fmtAgo(a.created_at)}</td>
              <td>{a.acknowledged_at
                ? <span className="muted small">vue</span>
                : <button className="link" onClick={() => run(() => acknowledgeAlert(a.id))}>Marquer vue</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
