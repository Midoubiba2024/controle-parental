import { useCallback, useEffect, useState } from "react";
import { errorMessage, t as tr, Trans, useI18n } from "../../i18n";
import { supabase } from "../../lib/supabase";
import { ageProfileFromBirth, type AuditEntry, type Child, type Device, type DeviceMode } from "../../lib/types";
import { fmtDateTime } from "../../lib/format";
import { ageProfileLabel, auditActionLabel, roleLabel } from "../../lib/labels";
import { EmptyState } from "../Ui";

// Équivalent de toLocaleTimeString() : heure avec secondes.
const TIME_WITH_SECONDS: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit" };

/** Libellé du mode d'appareil (valeur inconnue → affichée brute). */
function deviceModeLabel(mode: string): string {
  return mode === "standard" || mode === "reinforced" ? tr(`views.family.deviceMode.${mode}`) : mode;
}

export function FamilyView({ familyId, onChildrenChanged }: {
  familyId: string;
  onChildrenChanged?: () => void;
}) {
  const { t } = useI18n();
  const [children, setChildren] = useState<Child[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [c, d, a] = await Promise.all([
      supabase.from("children").select("*").eq("family_id", familyId).order("created_at"),
      supabase.from("devices").select("*").eq("family_id", familyId).order("created_at"),
      supabase.from("audit_log").select("*").eq("family_id", familyId)
        .order("created_at", { ascending: false }).limit(50),
    ]);
    if (c.error) setErr(errorMessage(c.error)); else { setChildren(c.data as Child[]); onChildrenChanged?.(); }
    if (!d.error) setDevices(d.data as Device[]);
    if (!a.error) setAudit(a.data as AuditEntry[]);
  }, [familyId, onChildrenChanged]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="grid dash" style={{ gap: 18 }}>
      <div className="card">
        <h2>{t("views.family.childrenTitle")}</h2>
        <AddChild familyId={familyId} onAdded={refresh} />
        {err && <p className="msg error">{err}</p>}
        {children.length === 0 && <EmptyState icon="👧" title={t("views.family.noChildTitle")}
          hint={t("views.family.noChildHint")} />}
        {children.map((ch) => (
          <ChildRow key={ch.id} child={ch} devices={devices.filter((d) => d.child_id === ch.id)} />
        ))}
      </div>

      <div className="card">
        <h2><Trans k="views.family.auditTitle" tags={{ muted: (c) => <span className="muted small">{c}</span> }} /></h2>
        {audit.length === 0 && <EmptyState title={t("views.family.auditEmpty")} />}
        <ul className="scroll" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {audit.map((a) => (
            <li key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 600 }}>{auditActionLabel(a.action)}</span>
              <span className="muted small">{t("views.family.auditMeta", { role: roleLabel(a.actor_role), date: fmtDateTime(a.created_at) })}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AddChild({ familyId, onAdded }: { familyId: string; onAdded: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.from("children").insert({
      family_id: familyId, display_name: name, birth_date: birth || null,
      age_profile: ageProfileFromBirth(birth || null),
    });
    setBusy(false);
    if (error) { setErr(errorMessage(error)); return; }
    setName(""); setBirth("");
    onAdded();
  }

  return (
    <form onSubmit={add} style={{ marginBottom: 12 }}>
      <div className="inline" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="muted small">{t("views.family.addChild.nameLabel")}</span>
          <input placeholder={t("views.family.addChild.namePlaceholder")} value={name} required onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="muted small">{t("views.family.addChild.birthLabel")}</span>
          <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
        </label>
        <button disabled={busy || !name.trim()} type="submit">{busy ? t("common.busy") : t("views.family.addChild.submit")}</button>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        {t("views.family.addChild.birthHint")}
      </p>
      {err && <p className="msg error">{err}</p>}
    </form>
  );
}

function ChildRow({ child, devices }: { child: Child; devices: Device[] }) {
  // « Standard » par défaut : le mode Renforcé exige que l'app soit propriétaire de
  // l'appareil (device owner, via adb après réinitialisation) — docs/10-INSTALLATION.md §6.
  const { t, fmt } = useI18n();
  const [mode, setMode] = useState<DeviceMode>("standard");
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function genCode() {
    setBusy(true); setErr(null); setCode(null);
    // RPC SECURITY DEFINER (migration 0028) : remplace l'Edge Function pairing-start,
    // qui échouait faute de clé service_role fiable côté Edge Functions.
    const { data, error } = await supabase.rpc("pairing_start", {
      p_family_id: child.family_id, p_child_id: child.id, p_mode: mode,
    });
    setBusy(false);
    if (error) { setErr(errorMessage(error)); return; }
    setCode(data as { code: string; expires_at: string });
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "14px 0" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{child.display_name}</strong>
        <span className="badge">{ageProfileLabel(child.age_profile)}</span>
      </div>
      <div className="inline" style={{ marginTop: 8 }}>
        <select value={mode} onChange={(e) => setMode(e.target.value as DeviceMode)}>
          <option value="standard">{t("views.family.pairing.modeStandard")}</option>
          <option value="reinforced">{t("views.family.pairing.modeReinforced")}</option>
        </select>
        <button className="ghost" disabled={busy} onClick={genCode}>{busy ? t("common.busy") : t("views.family.pairing.generate")}</button>
      </div>
      {code && (
        <p className="code" style={{ marginTop: 10 }}>
          <Trans k="views.family.pairing.code" params={{ code: code.code }} tags={{ b: (c) => <b>{c}</b> }} />
          <span className="muted small">{t("views.family.pairing.expires", { time: fmt.time(code.expires_at, TIME_WITH_SECONDS) })}</span>
        </p>
      )}
      {err && <p className="msg error">{err}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        {devices.length === 0 ? <span className="muted small">{t("views.family.noDevice")}</span>
          : devices.map((d) => (
            <span key={d.id} className="badge">
              {t(d.revoked_at ? "views.family.deviceBadgeRevoked" : "views.family.deviceBadge", {
                name: d.label ?? d.model ?? d.platform, mode: deviceModeLabel(d.mode),
              })}
            </span>
          ))}
      </div>
    </div>
  );
}
