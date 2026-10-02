import { useMemo, useState } from "react";
import { useLocation, requestLocate, GEOFENCE_TRANSITION_LABEL, LOCATION_MODE_LABEL,
  geofenceColor, activeSos } from "../../lib/location";
import { GEOFENCE_TYPE_LABEL } from "../../lib/location";
import { fmtAgo, fmtDateTime } from "../../lib/format";
import { Tile, EmptyState } from "../Ui";
import { MapCanvas, type MapCircle, type MapMarker } from "../map/MapCanvas";
import type { Child, LocationFix } from "../../lib/types";

/* =============================================================================
   LOT 3 — Vue « Localisation » : carte (Leaflet + OpenStreetMap), dernière
   position, zones de sécurité, historique de trajets. Live SOS via Realtime.
   TRANSPARENCE : positions de NOTRE app uniquement, jamais occultes, visibles de
   l'enfant. Le partage dépend du réglage (mode) piloté par le parent (onglet
   Sécurité) et affiché à l'enfant dans « mes données ».
   ============================================================================= */

/** Clé de jour locale d'un horodatage ISO (regroupement des trajets). */
function dayOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LocationView({ familyId, child }: { familyId: string; child: Child }) {
  const loc = useLocation(child.id);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const last = loc.fixes[0] ?? null;
  const sos = activeSos(loc.sos);

  // Jours disponibles (trajets), du plus récent au plus ancien.
  const days = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of loc.fixes) m.set(dayOf(f.captured_at), (m.get(dayOf(f.captured_at)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [loc.fixes]);

  // Relevés du jour sélectionné (sinon les 60 plus récents, tous confondus).
  const shown: LocationFix[] = useMemo(() => {
    if (selectedDay) {
      return loc.fixes.filter((f) => dayOf(f.captured_at) === selectedDay)
        .slice().sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    }
    return loc.fixes.slice(0, 60).slice().reverse();
  }, [loc.fixes, selectedDay]);

  const circles: MapCircle[] = loc.geofences.filter((g) => g.enabled).map((g) => ({
    id: g.id, lat: g.center_lat, lng: g.center_lng, radiusM: g.radius_m,
    color: geofenceColor(g.type),
    label: `${GEOFENCE_TYPE_LABEL[g.type]} · ${g.name} (${g.radius_m} m)`,
  }));

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    // Trace : points intermédiaires en pastilles discrètes.
    shown.forEach((f, i) => {
      const isLastOfTrace = i === shown.length - 1;
      if (isLastOfTrace) return; // le dernier est rendu comme « position »
      out.push({
        id: f.id, lat: f.latitude, lng: f.longitude, color: "var(--series-1)",
        kind: "dot", label: `${fmtDateTime(f.captured_at)} · ±${Math.round(f.accuracy_m ?? 0)} m`,
      });
    });
    // Dernière position connue (du trajet affiché, ou globale).
    const head = selectedDay ? shown[shown.length - 1] : last;
    if (head) {
      out.push({
        id: `pos-${head.id}`, lat: head.latitude, lng: head.longitude,
        color: sos ? "var(--danger)" : "var(--primary)",
        kind: sos ? "sos" : "position",
        label: `${sos ? "SOS — " : ""}Position · ${fmtDateTime(head.captured_at)} · ±${Math.round(head.accuracy_m ?? 0)} m`,
      });
    }
    return out;
  }, [shown, last, selectedDay, sos]);

  const path = shown.map((f) => ({ lat: f.latitude, lng: f.longitude }));

  const device = loc.devices.find((d) => !d.revoked_at) ?? loc.devices[0] ?? null;

  async function doLocate() {
    if (!device) return;
    setBusy(true); setMsg(null);
    const { error } = await requestLocate(familyId, child.id, device.id);
    setBusy(false);
    setMsg(error ? error : "Check-in demandé — la position arrivera dès que l'appareil répond.");
  }

  if (loc.loading) return <p className="muted">Chargement de la localisation…</p>;

  return (
    <div className="grid" style={{ gap: 18 }}>
      {loc.error && <p className="msg error">{loc.error}</p>}

      <div className="card" style={{ borderLeft: "3px solid var(--primary)" }}>
        <strong>Localisation transparente.</strong>{" "}
        <span className="muted">Seules les positions de cette application sont partagées —
        jamais à l'insu de l'enfant : il voit dans « mes données » quand et comment sa position
        est transmise. Partage actuel : <b>{loc.settings ? LOCATION_MODE_LABEL[loc.settings.mode] : "à la demande"}</b>.
        Les positions sont conservées {loc.settings?.retention_days ?? 30} jours puis supprimées.</span>
      </div>

      {sos && (
        <div className="card sos-banner">
          <span className="dot-pulse" />
          <strong>SOS en cours</strong> — déclenché {fmtAgo(sos.started_at)}.{" "}
          <span className="muted">La position est diffusée en direct ci-dessous. Détails et accusé de réception dans l'onglet <b>Sécurité / SOS</b>.</span>
        </div>
      )}

      <div className="grid cols-4">
        <Tile label="Dernière position" icon="📍"
          iconBg="color-mix(in srgb, var(--primary) 16%, transparent)"
          value={last ? fmtAgo(last.captured_at) : "—"} />
        <Tile label="Précision" icon="🎯"
          iconBg="color-mix(in srgb, var(--series-3) 18%, transparent)"
          value={last?.accuracy_m != null ? `±${Math.round(last.accuracy_m)} m` : "—"} />
        <Tile label="Zones de sécurité" icon="🏠"
          iconBg="color-mix(in srgb, var(--series-1) 18%, transparent)"
          value={loc.geofences.filter((g) => g.enabled).length} />
        <Tile label="Suivi temps réel" icon={loc.live ? "🟢" : "⚪"}
          iconBg="color-mix(in srgb, var(--series-6) 18%, transparent)"
          value={loc.live ? "Connecté" : "Repli polling"} />
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Carte</h2>
          <div className="row" style={{ gap: 8 }}>
            {loc.live && <span className="muted small"><span className="dot-live" />temps réel</span>}
            <button disabled={busy || !device} onClick={doLocate} title={device ? "" : "Aucun appareil appairé"}>
              {busy ? "…" : "📍 Demander un check-in"}
            </button>
          </div>
        </div>
        {msg && <p className="msg" style={{ marginTop: 0 }}>{msg}</p>}

        {loc.fixes.length === 0 && circles.length === 0 ? (
          <EmptyState icon="🗺️" title="Aucune position pour l'instant"
            hint="Dès que l'appareil enfant partage une position (périodique ou à la demande), elle apparaît ici. Les zones de sécurité se dessinent même sans position." />
        ) : (
          <MapCanvas markers={markers} circles={circles} path={path} height={440} />
        )}

        {days.length > 0 && (
          <>
            <div className="seg" style={{ marginTop: 14, flexWrap: "wrap" }}>
              <button className={selectedDay === null ? "on" : ""} onClick={() => setSelectedDay(null)}>
                Récent
              </button>
              {days.slice(0, 7).map(([d, n]) => (
                <button key={d} className={selectedDay === d ? "on" : ""} onClick={() => setSelectedDay(d)}>
                  {new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                  <span className="muted small"> · {n}</span>
                </button>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
              {selectedDay
                ? `Trajet du jour sélectionné (${shown.length} point${shown.length > 1 ? "s" : ""}).`
                : "Points récents, tous jours confondus. Choisis un jour pour voir le trajet détaillé."}
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2>Arrivées & départs <span className="muted small">(zones de sécurité)</span></h2>
        {loc.events.length === 0 ? (
          <EmptyState icon="🚪" title="Aucun passage de zone"
            hint="Les alertes « bien arrivé » (école, maison) s'affichent ici dès qu'une zone est définie et franchie." />
        ) : (
          <table className="tbl">
            <thead><tr><th>Événement</th><th>Zone</th><th>Quand</th></tr></thead>
            <tbody>
              {loc.events.slice(0, 20).map((e) => (
                <tr key={e.id}>
                  <td><span className={`pill ${e.transition === "enter" ? "in" : e.transition === "exit" ? "out" : ""}`}>
                    {GEOFENCE_TRANSITION_LABEL[e.transition]}</span></td>
                  <td>{e.geofence_name
                    ?? loc.geofences.find((g) => g.id === e.geofence_id)?.name
                    ?? "Zone supprimée"}</td>
                  <td className="muted">{fmtDateTime(e.occurred_at)} · {fmtAgo(e.occurred_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
