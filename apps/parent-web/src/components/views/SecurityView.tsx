import { useState } from "react";
import {
  useLocation, saveGeofence, deleteGeofence, saveLocationSettings,
  ackSos, resolveSos, acknowledgeAlert, GEOFENCE_TYPE_LABEL, geofenceColor,
} from "../../lib/location";
import { fmtAgo, fmtDateTime } from "../../lib/format";
import type { CSSProperties } from "react";
import { BatteryLow, Check, House, LifeBuoy, MapPin, Plus, School, Siren } from "lucide-react";
import { EmptyState, ViewSkeleton } from "../Ui";
import { ic } from "../icons";
import { useI18n, t as tr } from "../../i18n";
import { MapCanvas, type MapCircle, type MapMarker } from "../map/MapCanvas";
import type { Child, Geofence, GeofenceType, LocationMode, SosEvent } from "../../lib/types";

/* =============================================================================
   LOT 3 — Vue « Sécurité / SOS » : épisodes SOS (position live, accusé « aide en
   route » E6), alertes de sécurité (batterie faible D7), édition des zones de
   sécurité (geofences D4/D5) et réglage du partage de position (graduation âge).
   ============================================================================= */

export function SecurityView({ familyId, child }: { familyId: string; child: Child }) {
  const { t } = useI18n();
  const loc = useLocation(child.id);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(fn: () => Promise<{ error: string | null }>) {
    setMsg(null);
    const { error } = await fn();
    if (error) setMsg(error); else loc.reload();
  }

  if (loc.loading) return <ViewSkeleton compact />;

  const openSos = loc.sos.filter((s) => s.status !== "resolved");

  return (
    <div className="stack" style={{ gap: 20 }}>
      {loc.error && <p className="msg error">{loc.error}</p>}
      {msg && <p className="msg error">{msg}</p>}

      {openSos.map((s) => <SosBanner key={s.id} sos={s} loc={loc} run={run} />)}

      <SettingsCard familyId={familyId} child={child} loc={loc} run={run} />

      <ZonesCard familyId={familyId} child={child} loc={loc} run={run} />

      <AlertsCard loc={loc} run={run} />

      <div className="card">
        <h2>{t("views.security.history.title")}</h2>
        {loc.sos.length === 0 ? (
          <EmptyState icon={LifeBuoy} title={t("views.security.history.emptyTitle")}
            hint={t("views.security.history.emptyHint")} />
        ) : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{t("views.security.history.colStatus")}</th><th>{t("views.security.history.colStart")}</th><th>{t("views.security.history.colEnd")}</th></tr></thead>
            <tbody>
              {loc.sos.map((s) => (
                <tr key={s.id}>
                  <td><span className={`pill ${s.status === "resolved" ? "" : "blocked"}`}>{sosStatusLabel(s)}</span></td>
                  <td className="muted" data-label={t("common.cellLabel", { label: t("views.security.history.colStart") })}>{fmtDateTime(s.started_at)}</td>
                  <td className="muted" data-label={t("common.cellLabel", { label: t("views.security.history.colEnd") })}>{s.ended_at ? fmtDateTime(s.ended_at) : t("common.none")}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function sosStatusLabel(s: SosEvent): string {
  return tr(`views.security.sosStatus.${s.status}`);
}

/* ------------------------------ Bandeau SOS actif ----------------------- */
function SosBanner({ sos, loc, run }: {
  sos: SosEvent;
  loc: ReturnType<typeof useLocation>;
  run: (fn: () => Promise<{ error: string | null }>) => void;
}) {
  const { t } = useI18n();
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
          ? t("views.security.banner.sosPositionLabel", { date: fmtDateTime(head.captured_at) })
          : t("views.security.banner.lastKnownBeforeSosLabel", { date: fmtDateTime(head.captured_at) }),
      }]
    : [];
  const path = liveFixes.map((f) => ({ lat: f.latitude, lng: f.longitude }));

  return (
    <div className="card sos-banner" role="alert">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><Siren {...ic} style={{ color: "var(--c-danger)", verticalAlign: "middle", marginInlineEnd: 8 }} /><span className="dot-pulse" /><strong style={{ fontSize: "1.05rem" }}>{t("views.security.banner.title", { status: sosStatusLabel(sos) })}</strong>
          <div className="muted small">{sos.message
            ? t("views.security.banner.triggeredWithMessage", { ago: fmtAgo(sos.started_at), date: fmtDateTime(sos.started_at), message: sos.message })
            : t("views.security.banner.triggered", { ago: fmtAgo(sos.started_at), date: fmtDateTime(sos.started_at) })}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {sos.status === "active" && (
            <button onClick={() => run(() => ackSos(sos.id))} title={t("views.security.banner.ackTitle")}>
              <Check {...ic} size={18} />{t("views.security.banner.ackButton")}
            </button>
          )}
          <button className="ghost" onClick={() => run(() => resolveSos(sos.id))}>{t("views.security.banner.resolveButton")}</button>
        </div>
      </div>
      {head ? (
        <div style={{ marginTop: 12 }}>
          <div className="map-frame"><MapCanvas markers={markers} path={path} height={300} /></div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {isLive
              ? t(loc.live ? "views.security.banner.liveCaptionStreaming" : "views.security.banner.liveCaption",
                { ago: fmtAgo(head.captured_at), accuracy: Math.round(head.accuracy_m ?? 0) })
              : t("views.security.banner.noSosPositionCaption",
                { ago: fmtAgo(head.captured_at), accuracy: Math.round(head.accuracy_m ?? 0) })}
          </p>
        </div>
      ) : (
        <p className="muted small" style={{ marginBottom: 0 }}>{t("views.security.banner.waitingFirstPosition")}</p>
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
  const { t } = useI18n();
  const s = loc.settings;
  const mode: LocationMode = s?.mode ?? "on_demand";
  // Repère par âge : jeune enfant → périodique OK ; (pré)ado → privilégier le
  // check-in à la demande (CNIL : autonomie croissante, moins intrusif).
  const suggestPeriodic = child.age_profile === "young_child";

  return (
    <div className="card">
      <h2>{t("views.security.settings.title")} <span className="muted small">{t("views.security.settings.titleHint")}</span></h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        {suggestPeriodic
          ? t("views.security.settings.youngChildAdvice")
          : t("views.security.settings.teenAdvice")}
      </p>
      <div className="row settings-row" style={{ gap: 18, flexWrap: "wrap" }}>
        <label className="fld">
          {t("views.security.settings.modeLabel")}
          <select value={mode} onChange={(e) =>
            run(() => saveLocationSettings(familyId, child.id, { mode: e.target.value as LocationMode }))}>
            <option value="off">{t("views.security.settings.modeOff")}</option>
            <option value="on_demand">{t(!suggestPeriodic ? "views.security.settings.modeOnDemandRecommended" : "views.security.settings.modeOnDemand")}</option>
            <option value="periodic">{t(suggestPeriodic ? "views.security.settings.modePeriodicRecommended" : "views.security.settings.modePeriodic")}</option>
          </select>
        </label>

        {mode === "periodic" && (
          <label className="fld">
            {t("views.security.settings.frequencyLabel")}
            <select value={s?.periodic_interval_sec ?? 900} onChange={(e) =>
              run(() => saveLocationSettings(familyId, child.id, { periodic_interval_sec: Number(e.target.value) }))}>
              <option value={300}>{t("views.security.settings.every5Min")}</option>
              <option value={900}>{t("views.security.settings.every15Min")}</option>
              <option value={1800}>{t("views.security.settings.every30Min")}</option>
              <option value={3600}>{t("views.security.settings.everyHour")}</option>
            </select>
          </label>
        )}

        <label className="fld">
          {t("views.security.settings.retentionLabel")}
          <select value={s?.retention_days ?? 30} onChange={(e) =>
            run(() => saveLocationSettings(familyId, child.id, { retention_days: Number(e.target.value) }))}>
            <option value={7}>{t("views.security.settings.retentionDays", { days: 7 })}</option>
            <option value={30}>{t("views.security.settings.retentionDays", { days: 30 })}</option>
            <option value={90}>{t("views.security.settings.retentionDays", { days: 90 })}</option>
          </select>
        </label>

        <label className="fld">
          {t("views.security.settings.accuracyLabel")}
          <select value={s?.high_accuracy ? "high" : "balanced"} onChange={(e) =>
            run(() => saveLocationSettings(familyId, child.id, { high_accuracy: e.target.value === "high" }))}>
            <option value="balanced">{t("views.security.settings.accuracyBalanced")}</option>
            <option value="high">{t("views.security.settings.accuracyHigh")}</option>
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
  const { t } = useI18n();
  const [editing, setEditing] = useState<Geofence | "new" | null>(null);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{t("views.security.zones.title")} <span className="muted small">{t("views.security.zones.titleHint")}</span></h2>
        {editing === null && <button onClick={() => setEditing("new")}><Plus {...ic} size={18} strokeWidth={2} />{t("views.security.zones.addButton")}</button>}
      </div>

      {editing !== null ? (
        <ZoneForm
          familyId={familyId} child={child} loc={loc}
          zone={editing === "new" ? null : editing}
          onDone={() => { setEditing(null); loc.reload(); }}
          onCancel={() => setEditing(null)}
        />
      ) : loc.geofences.length === 0 ? (
        <EmptyState icon={House} title={t("views.security.zones.emptyTitle")}
          hint={t("views.security.zones.emptyHint")} />
      ) : (
        <div>
          {loc.geofences.map((g) => (
            <div className="list-row zone-row" key={g.id}>
              <span className="zone-ic" aria-hidden="true" style={{ "--ic-color": geofenceColor(g.type) } as CSSProperties}>
                {g.type === "home" ? <House {...ic} size={18} /> : g.type === "school" ? <School {...ic} size={18} /> : <MapPin {...ic} size={18} />}
              </span>
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                {/* Type en légende seulement s'il apporte une information (≠ du nom). */}
                {GEOFENCE_TYPE_LABEL[g.type].toLocaleLowerCase() !== g.name.trim().toLocaleLowerCase() && (
                  <div className="muted small">{GEOFENCE_TYPE_LABEL[g.type]}</div>
                )}
                <div className="muted small">
                  {t(g.enabled ? "views.security.zones.summary" : "views.security.zones.summaryDisabled", {
                    radius: g.radius_m,
                    alerts: g.notify_enter && g.notify_exit ? t("views.security.zones.notifyBoth")
                      : g.notify_enter ? t("views.security.zones.notifyEnter")
                      : g.notify_exit ? t("views.security.zones.notifyExit") : "",
                  })}
                </div>
              </div>
              <div className="zone-actions">
              <button className="soft" onClick={() =>
                run(() => saveGeofence(familyId, child.id, {
                  id: g.id, name: g.name, type: g.type, center_lat: g.center_lat,
                  center_lng: g.center_lng, radius_m: g.radius_m, enabled: !g.enabled,
                  notify_enter: g.notify_enter, notify_exit: g.notify_exit,
                }))}>
                {g.enabled ? t("views.security.zones.disable") : t("views.security.zones.enable")}
              </button>
              <button className="soft" onClick={() => setEditing(g)}>{t("views.security.zones.edit")}</button>
              <button className="link" style={{ color: "var(--c-danger)" }} onClick={() => { if (confirm(t("views.security.zones.confirmDelete", { name: g.name }))) run(() => deleteGeofence(g.id)); }}>
                {t("views.security.zones.delete")}
              </button>
              </div>
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
  const { t } = useI18n();
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
  const markers: MapMarker[] = [{ id: "center", lat, lng, color: geofenceColor(type), kind: "position", label: t("views.security.zoneForm.centerMarker") }];

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
        {t("views.security.zoneForm.mapHint")}
      </p>
      <div className="map-frame"><MapCanvas markers={markers} circles={circles} height={300}
        onClick={(la, ln) => { setLat(Number(la.toFixed(6))); setLng(Number(ln.toFixed(6))); }} /></div>
      <div className="row" style={{ gap: 14, marginTop: 14, alignItems: "flex-end" }}>
        <label className="fld" style={{ flex: 1, minWidth: 160 }}>
          {t("views.security.zoneForm.nameLabel")}
          <input value={name} required placeholder={t("views.security.zoneForm.namePlaceholder")} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="fld">
          {t("views.security.zoneForm.typeLabel")}
          <select value={type} onChange={(e) => setType(e.target.value as GeofenceType)}>
            <option value="home">{t("views.security.zoneForm.typeHome")}</option>
            <option value="school">{t("views.security.zoneForm.typeSchool")}</option>
            <option value="custom">{t("views.security.zoneForm.typeCustom")}</option>
          </select>
        </label>
        <label className="fld">
          {t("views.security.zoneForm.radiusLabel", { radius })}
          <input type="range" min={80} max={2000} step={10} value={radius}
            onChange={(e) => setRadius(Number(e.target.value))} />
        </label>
      </div>
      <div className="row" style={{ gap: 18, marginTop: 10 }}>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={notifyEnter} onChange={(e) => setNotifyEnter(e.target.checked)} />
          {t("views.security.zoneForm.notifyEnter")}
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={notifyExit} onChange={(e) => setNotifyExit(e.target.checked)} />
          {t("views.security.zoneForm.notifyExit")}
        </label>
      </div>
      <div className="muted small" style={{ marginTop: 8 }}>
        {t("views.security.zoneForm.center", { lat: lat.toFixed(5), lng: lng.toFixed(5) })}
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button type="submit" disabled={busy || !name.trim()}>{busy ? t("common.busy") : zone ? t("views.security.zoneForm.save") : t("views.security.zoneForm.create")}</button>
        <button type="button" className="ghost" onClick={onCancel}>{t("views.security.zoneForm.cancel")}</button>
      </div>
    </form>
  );
}

/* ------------------------------ Alertes de sécurité --------------------- */
function AlertsCard({ loc, run }: {
  loc: ReturnType<typeof useLocation>;
  run: (fn: () => Promise<{ error: string | null }>) => void;
}) {
  const { t, fmt } = useI18n();
  const unseen = loc.alerts.filter((a) => !a.acknowledged_at);
  if (loc.alerts.length === 0) return null;
  return (
    <div className="card">
      <h2>{t("views.security.alerts.title")} <span className="muted small">{t("views.security.alerts.unseen", { count: unseen.length })}</span></h2>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>{t("views.security.alerts.colAlert")}</th><th>{t("views.security.alerts.colWhen")}</th><th>{t("views.security.alerts.colState")}</th></tr></thead>
        <tbody>
          {loc.alerts.slice(0, 20).map((a) => (
            <tr key={a.id}>
              <td><BatteryLow {...ic} size={18} style={{ verticalAlign: "middle", marginInlineEnd: 8, color: "var(--c-warning)" }} />{a.battery_level != null ? t("views.security.alerts.lowBatteryLevel", { level: fmt.percent(a.battery_level) }) : t("views.security.alerts.lowBattery")}</td>
              <td className="muted" data-label={t("common.cellLabel", { label: t("views.security.alerts.colWhen") })}>{fmtDateTime(a.created_at)}</td>
              <td data-label={t("common.cellLabel", { label: t("views.security.alerts.colState") })}>{a.acknowledged_at
                ? <span className="badge good">{t("views.security.alerts.seen")}</span>
                : <button className="link" onClick={() => run(() => acknowledgeAlert(a.id))}>{t("views.security.alerts.markSeen")}</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
