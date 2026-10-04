import { useMemo, useState } from "react";
import { useLocation, requestLocate, GEOFENCE_TRANSITION_LABEL, LOCATION_MODE_LABEL,
  geofenceColor, activeSos } from "../../lib/location";
import { GEOFENCE_TYPE_LABEL } from "../../lib/location";
import { fmtAgo, fmtDateTime, localDayKey } from "../../lib/format";
import { Tile, EmptyState } from "../Ui";
import { useI18n, Trans } from "../../i18n";
import { MapCanvas, type MapCircle, type MapMarker } from "../map/MapCanvas";
import type { Child, LocationFix } from "../../lib/types";

/* =============================================================================
   LOT 3 — Vue « Localisation » : carte (Leaflet + OpenStreetMap), dernière
   position, zones de sécurité, historique de trajets. Live SOS via Realtime.
   TRANSPARENCE : positions de NOTRE app uniquement, jamais occultes, visibles de
   l'enfant. Le partage dépend du réglage (mode) piloté par le parent (onglet
   Sécurité) et affiché à l'enfant dans « mes données ».
   ============================================================================= */

export function LocationView({ familyId, child }: { familyId: string; child: Child }) {
  const { t, fmt, locale } = useI18n();
  const loc = useLocation(child.id);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const last = loc.fixes[0] ?? null;
  const sos = activeSos(loc.sos);

  // Jours disponibles (trajets), du plus récent au plus ancien.
  const days = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of loc.fixes) {
      const k = localDayKey(f.captured_at);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [loc.fixes]);

  // Relevés du jour sélectionné (sinon les 60 plus récents, tous confondus).
  const shown: LocationFix[] = useMemo(() => {
    if (selectedDay) {
      return loc.fixes.filter((f) => localDayKey(f.captured_at) === selectedDay)
        .slice().sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    }
    return loc.fixes.slice(0, 60).slice().reverse();
  }, [loc.fixes, selectedDay]);

  const circles: MapCircle[] = useMemo(() => loc.geofences.filter((g) => g.enabled).map((g) => ({
    id: g.id, lat: g.center_lat, lng: g.center_lng, radiusM: g.radius_m,
    color: geofenceColor(g.type),
    label: t("views.location.map.zoneLabel", { type: GEOFENCE_TYPE_LABEL[g.type], name: g.name, radius: g.radius_m }),
  })), [loc.geofences, locale]);

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    // Trace : points intermédiaires en pastilles discrètes.
    shown.forEach((f, i) => {
      const isLastOfTrace = i === shown.length - 1;
      if (isLastOfTrace) return; // le dernier est rendu comme « position »
      out.push({
        id: f.id, lat: f.latitude, lng: f.longitude, color: "var(--series-1)",
        kind: "dot", label: t("views.location.map.traceDotLabel", { date: fmtDateTime(f.captured_at), accuracy: Math.round(f.accuracy_m ?? 0) }),
      });
    });
    // Dernière position connue (du trajet affiché, ou globale).
    const head = selectedDay ? shown[shown.length - 1] : last;
    if (head) {
      out.push({
        id: `pos-${head.id}`, lat: head.latitude, lng: head.longitude,
        color: sos ? "var(--danger)" : "var(--primary)",
        kind: sos ? "sos" : "position",
        label: t(sos ? "views.location.map.sosPositionLabel" : "views.location.map.positionLabel",
          { date: fmtDateTime(head.captured_at), accuracy: Math.round(head.accuracy_m ?? 0) }),
      });
    }
    return out;
  }, [shown, last, selectedDay, sos, locale]);

  const path = useMemo(() => shown.map((f) => ({ lat: f.latitude, lng: f.longitude })), [shown]);

  const device = loc.devices.find((d) => !d.revoked_at) ?? loc.devices[0] ?? null;

  async function doLocate() {
    if (!device) return;
    setBusy(true); setMsg(null);
    const { error } = await requestLocate(familyId, child.id, device.id);
    setBusy(false);
    setMsg(error ? error : t("views.location.checkInRequested"));
  }

  if (loc.loading) return <p className="muted">{t("views.location.loading")}</p>;

  return (
    <div className="grid" style={{ gap: 18 }}>
      {loc.error && <p className="msg error">{loc.error}</p>}

      <div className="card" style={{ borderInlineStart: "3px solid var(--primary)" }}>
        <strong>{t("views.location.transparency.title")}</strong>{" "}
        <span className="muted"><Trans k="views.location.transparency.body"
          tags={{ b: (c) => <b>{c}</b> }}
          params={{
            mode: loc.settings ? LOCATION_MODE_LABEL[loc.settings.mode] : t("views.location.transparency.defaultMode"),
            count: loc.settings?.retention_days ?? 30,
          }} /></span>
      </div>

      {sos && (
        <div className="card sos-banner">
          <span className="dot-pulse" />
          <Trans k="views.location.sos.title" tags={{ strong: (c) => <strong>{c}</strong> }}
            params={{ ago: fmtAgo(sos.started_at) }} />{" "}
          <span className="muted"><Trans k="views.location.sos.hint" tags={{ b: (c) => <b>{c}</b> }} /></span>
        </div>
      )}

      <div className="grid cols-4">
        <Tile label={t("views.location.tiles.lastPosition")} icon="📍"
          iconBg="color-mix(in srgb, var(--primary) 16%, transparent)"
          value={last ? fmtAgo(last.captured_at) : t("common.none")} />
        <Tile label={t("views.location.tiles.accuracy")} icon="🎯"
          iconBg="color-mix(in srgb, var(--series-3) 18%, transparent)"
          value={last?.accuracy_m != null ? t("views.location.tiles.accuracyValue", { accuracy: Math.round(last.accuracy_m) }) : t("common.none")} />
        <Tile label={t("views.location.tiles.zones")} icon="🏠"
          iconBg="color-mix(in srgb, var(--series-1) 18%, transparent)"
          value={loc.geofences.filter((g) => g.enabled).length} />
        <Tile label={t("views.location.tiles.realtime")} icon={loc.live ? "🟢" : "⚪"}
          iconBg="color-mix(in srgb, var(--series-6) 18%, transparent)"
          value={loc.live ? t("views.location.tiles.connected") : t("views.location.tiles.pollingFallback")} />
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t("views.location.map.title")}</h2>
          <div className="row" style={{ gap: 8 }}>
            {loc.live && <span className="muted small"><span className="dot-live" />{t("views.location.map.realtime")}</span>}
            <button disabled={busy || !device} onClick={doLocate} title={device ? "" : t("views.location.map.noDevice")}>
              {busy ? t("common.busy") : t("views.location.map.requestCheckIn")}
            </button>
          </div>
        </div>
        {msg && <p className="msg" style={{ marginTop: 0 }}>{msg}</p>}

        {loc.fixes.length === 0 && circles.length === 0 ? (
          <EmptyState icon="🗺️" title={t("views.location.map.emptyTitle")}
            hint={t("views.location.map.emptyHint")} />
        ) : (
          <MapCanvas markers={markers} circles={circles} path={path} height={440} />
        )}

        {days.length > 0 && (
          <>
            <div className="seg" style={{ marginTop: 14, flexWrap: "wrap" }}>
              <button className={selectedDay === null ? "on" : ""} onClick={() => setSelectedDay(null)}>
                {t("views.location.map.recent")}
              </button>
              {days.slice(0, 7).map(([d, n]) => (
                <button key={d} className={selectedDay === d ? "on" : ""} onClick={() => setSelectedDay(d)}>
                  {fmt.date(new Date(d + "T00:00:00"), { weekday: "short", day: "numeric", month: "short" })}
                  <span className="muted small"> · {n}</span>
                </button>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
              {selectedDay
                ? t("views.location.map.dayTrace", { count: shown.length })
                : t("views.location.map.recentHint")}
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2>{t("views.location.events.title")} <span className="muted small">{t("views.location.events.titleHint")}</span></h2>
        {loc.events.length === 0 ? (
          <EmptyState icon="🚪" title={t("views.location.events.emptyTitle")}
            hint={t("views.location.events.emptyHint")} />
        ) : (
          <table className="tbl">
            <thead><tr><th>{t("views.location.events.colEvent")}</th><th>{t("views.location.events.colZone")}</th><th>{t("views.location.events.colWhen")}</th></tr></thead>
            <tbody>
              {loc.events.slice(0, 20).map((e) => (
                <tr key={e.id}>
                  <td><span className={`pill ${e.transition === "enter" ? "in" : e.transition === "exit" ? "out" : ""}`}>
                    {GEOFENCE_TRANSITION_LABEL[e.transition]}</span></td>
                  <td>{e.geofence_name
                    ?? loc.geofences.find((g) => g.id === e.geofence_id)?.name
                    ?? t("views.location.events.deletedZone")}</td>
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
