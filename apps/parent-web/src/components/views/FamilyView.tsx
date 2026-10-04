import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock3, Copy, FileText, KeyRound, Plus, Smartphone, Users } from "lucide-react";
import { errorMessage, t as tr, useI18n } from "../../i18n";
import { supabase } from "../../lib/supabase";
import { ageProfileFromBirth, type AuditEntry, type Child, type Device, type DeviceMode } from "../../lib/types";
import { fmtDateTime } from "../../lib/format";
import { ageProfileLabel, auditActionLabel, roleLabel } from "../../lib/labels";
import { CardHead, EmptyState } from "../Ui";
import { auditIcon, ic, icSm } from "../icons";

/** Libellé du mode d'appareil (valeur inconnue → affichée brute). */
function deviceModeLabel(mode: string): string {
  return mode === "standard" || mode === "reinforced" ? tr(`views.family.deviceMode.${mode}`) : mode;
}

/** Âge révolu à partir de la date de naissance (null si absente/invalide). */
function ageYears(birth: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth + "T00:00:00");
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let y = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) y--;
  return y >= 0 ? y : null;
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

  const paired = devices.filter((d) => !d.revoked_at).length;

  return (
    <div className="grid dash-wide top">
      <section className="card stack" style={{ gap: 20 }} aria-labelledby="fam-children">
        <CardHead id="fam-children" title={t("views.family.childrenTitle")}
          sub={t("views.family.summary", {
            children: t("views.family.childrenCount", { count: children.length }),
            devices: paired > 0 ? t("views.family.devicesCount", { count: paired }) : t("views.family.noDevicePaired"),
          })} />
        <AddChild familyId={familyId} onAdded={refresh} />
        {err && <p className="msg error">{err}</p>}
        {children.length === 0 && <EmptyState icon={Users} title={t("views.family.noChildTitle")}
          hint={t("views.family.noChildHint")} />}
        {children.map((ch) => (
          <ChildCard key={ch.id} child={ch} devices={devices.filter((d) => d.child_id === ch.id)} />
        ))}
      </section>

      <section className="card" aria-labelledby="fam-audit">
        <CardHead id="fam-audit" icon={FileText} title={t("views.family.auditTitle")} sub={t("views.family.auditSubtitle")} />
        {audit.length === 0 ? <EmptyState title={t("views.family.auditEmpty")} /> : (
          <ol className="timeline scroll" style={{ maxHeight: 640 }}>
            {audit.map((a) => {
              const { Icon, tone } = auditIcon(a.action);
              return (
                <li key={a.id}>
                  <div className="rail">
                    <span className={`dot tone-${tone}`}><Icon {...ic} size={18} /></span>
                    <span className="line" aria-hidden="true" />
                  </div>
                  <div className="body">
                    <p className="what">{auditActionLabel(a.action)}</p>
                    <p className="meta">
                      <span className="badge sand">{roleLabel(a.actor_role)}</span>
                      <time dateTime={a.created_at}>{fmtDateTime(a.created_at)}</time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
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
    <form onSubmit={add} className="panel" aria-labelledby="add-child-title">
      <h3 id="add-child-title" style={{ margin: 0 }}>{t("views.family.addChild.title")}</h3>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "14px 16px", alignItems: "start" }}>
        <label htmlFor="child-name">{t("views.family.addChild.nameLabel")}
          <input id="child-name" placeholder={t("views.family.addChild.namePlaceholder")} value={name} required
            autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </label>
        <label htmlFor="child-birth">{t("views.family.addChild.birthLabel")}
          <input id="child-birth" type="date" value={birth} aria-describedby="child-birth-hint"
            onChange={(e) => setBirth(e.target.value)} />
        </label>
        <div style={{ paddingTop: 26 }} className="add-child-submit">
          <button disabled={busy || !name.trim()} type="submit" className="block">
            <Plus {...ic} size={18} strokeWidth={2} />{busy ? t("common.busy") : t("views.family.addChild.submit")}
          </button>
        </div>
      </div>
      <p id="child-birth-hint" className="card-sub" style={{ margin: 0 }}>{t("views.family.addChild.birthHint")}</p>
      {err && <p className="msg error">{err}</p>}
    </form>
  );
}

function ChildCard({ child, devices }: { child: Child; devices: Device[] }) {
  // « Standard » par défaut : le mode Renforcé exige que l'app soit propriétaire de
  // l'appareil (device owner, via adb après réinitialisation) — docs/10-INSTALLATION.md §6.
  const { t } = useI18n();
  const [mode, setMode] = useState<DeviceMode>("standard");
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const age = ageYears(child.birth_date);
  const headId = `child-${child.id}`;

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
    <article className="child-card" aria-labelledby={headId}>
      <div className="row between" style={{ gap: 16 }}>
        <div className="child-id">
          <span className="avatar lg" aria-hidden="true">{child.display_name.trim().charAt(0).toLocaleUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <h3 id={headId} className="child-name">{child.display_name}</h3>
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <span className="badge sage">{ageProfileLabel(child.age_profile)}</span>
              {age != null && <span className="small muted">{t("views.family.age", { count: age })}</span>}
            </div>
          </div>
        </div>
        <label className="row" htmlFor={`mode-${child.id}`} style={{ gap: 10, fontWeight: 600, fontSize: 13 }}>
          {t("views.family.pairing.modeLabel")}
          <select id={`mode-${child.id}`} value={mode} onChange={(e) => setMode(e.target.value as DeviceMode)}>
            <option value="standard">{t("views.family.pairing.modeStandard")}</option>
            <option value="reinforced">{t("views.family.pairing.modeReinforced")}</option>
          </select>
        </label>
      </div>

      <hr className="divider" />

      <div className="row between">
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14.5 }}>{t("views.family.pairing.title")}</p>
          <p className="card-sub" style={{ marginTop: 2 }}>{t("views.family.pairing.hint")}</p>
        </div>
        <button type="button" className="ghost" disabled={busy} onClick={genCode}>
          <KeyRound {...ic} size={18} />{busy ? t("common.busy") : t("views.family.pairing.generate")}
        </button>
      </div>

      {code && <PairingTicket code={code.code} expiresAt={code.expires_at} />}
      {err && <p className="msg error">{err}</p>}

      {devices.length === 0 ? (
        <div className="note">
          <Smartphone {...ic} />
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: "var(--c-ink)" }}>{t("views.family.noDeviceTitle")}</p>
            <p style={{ margin: "4px 0 0" }}>{t("views.family.noDeviceHint", { name: child.display_name })}</p>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>{t("views.family.devicesTitle")}</h3>
          {devices.map((d) => (
            <div key={d.id} className="device-item" style={{ opacity: d.revoked_at ? 0.65 : 1 }}>
              <span className="ic"><Smartphone {...ic} /></span>
              <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>
                {t(d.revoked_at ? "views.family.deviceBadgeRevoked" : "views.family.deviceBadge", {
                  name: d.label ?? d.model ?? d.platform, mode: deviceModeLabel(d.mode),
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

/** Code d'appairage en « ticket » : chiffres groupés, expiration, bouton Copier. */
function PairingTicket({ code, expiresAt }: { code: string; expiresAt: string }) {
  const { t, fmt } = useI18n();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const digitsRef = useRef<HTMLParagraphElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Groupes de 4 (« 5338 1539 ») ; le code copié reste brut.
  const groups = code.replace(/\s+/g, "").match(/.{1,4}/g) ?? [code];

  async function copy() {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(code); ok = true; }
    } catch { /* API refusée : repli ci-dessous */ }
    if (!ok) {
      // Repli : zone de texte temporaire + execCommand (anciens navigateurs, contexte non sécurisé).
      try {
        const ta = document.createElement("textarea");
        ta.value = code; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch { ok = false; }
    }
    if (!ok && digitsRef.current) {
      // Dernier recours : sélectionner le code pour une copie manuelle.
      const range = document.createRange();
      range.selectNodeContents(digitsRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges(); sel?.addRange(range);
    }
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setState("idle"), 2200);
  }

  return (
    <div className="ticket">
      <div style={{ minWidth: 0 }}>
        <p className="kicker">{t("views.family.pairing.kicker")}</p>
        <p className="digits" ref={digitsRef}>
          {groups.map((g, i) => <span key={i} className="grp">{g}</span>)}
        </p>
        <p className="exp">
          <Clock3 {...icSm} size={15} />
          {t("views.family.pairing.expiresAt", { time: fmt.time(expiresAt, { hour: "2-digit", minute: "2-digit" }) })}
        </p>
        {state === "failed" && <p className="exp" role="status">{t("views.family.pairing.copyFallback")}</p>}
      </div>
      <button type="button" className={`copy${state === "copied" ? " done" : ""}`} onClick={copy}
        aria-label={t("views.family.pairing.copyAria")}>
        {state === "copied" ? <Check {...ic} /> : <Copy {...ic} />}
        <span aria-hidden="true">{state === "copied" ? t("views.family.pairing.copied") : t("views.family.pairing.copy")}</span>
      </button>
      <span className="visually-hidden" aria-live="polite">{state === "copied" ? t("views.family.pairing.copiedAnnounce") : ""}</span>
    </div>
  );
}
