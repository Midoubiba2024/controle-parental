import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useObservation } from "../lib/observation";
import { fmtBytes } from "../lib/format";
import { errorMessage, Trans, useI18n } from "../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Child, Device, DeviceStatus, Family } from "../lib/types";
import { OverviewView } from "./views/OverviewView";
import { ScreenTimeView } from "./views/ScreenTimeView";
import { ApplicationsView } from "./views/ApplicationsView";
import { CallsView } from "./views/CallsView";
import { FamilyView } from "./views/FamilyView";
import { RulesView } from "./views/RulesView";
import { RequestsView } from "./views/RequestsView";
import { MessagesView } from "./views/MessagesView";
import { LocationView } from "./views/LocationView";
import { SecurityView } from "./views/SecurityView";
import { FilteringView } from "./views/FilteringView";
import { SafetyView } from "./views/SafetyView";
import { PrivacyView } from "./views/PrivacyView";

type View =
  | "overview" | "screen" | "apps" | "calls" | "rules" | "filter"
  | "location" | "security" | "wellbeing" | "requests" | "messages" | "family" | "privacy";

// Libellés de navigation : nav.<vue> ; titres de page : dashboard.viewTitle.<vue>.
const NAV: { key: View; icon: string }[] = [
  { key: "overview", icon: "◎" },
  { key: "screen", icon: "⏱" },
  { key: "apps", icon: "▦" },
  { key: "calls", icon: "☏" },
  { key: "rules", icon: "⛬" },
  { key: "filter", icon: "🛡" },
  { key: "location", icon: "📍" },
  { key: "security", icon: "🆘" },
  { key: "wellbeing", icon: "🫶" },
  { key: "requests", icon: "✉" },
  { key: "messages", icon: "💬" },
  { key: "family", icon: "⌂" },
  { key: "privacy", icon: "🔒" },
];

export function Dashboard({ session }: { session: Session }) {
  const { t } = useI18n();
  const [families, setFamilies] = useState<Family[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  // Onglet mémorisé entre rafraîchissements (évite de « perdre » la vue Famille au
  // rechargement — les données ne sont jamais perdues, seul l'onglet actif change).
  const [view, setView] = useState<View>(() => {
    try {
      const saved = localStorage.getItem("cp.view") as View | null;
      return saved && NAV.some((n) => n.key === saved) ? saved : "overview";
    } catch { return "overview"; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, cycleTheme] = useTheme();

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    // On ne retombe sur une liste vide (→ écran « Créer une famille ») QUE sur un
    // succès. Une erreur (réseau/RLS) ne doit pas masquer les familles existantes.
    const { data, error } = await supabase.from("families").select("id,name,created_at").order("created_at");
    if (error) { setError(errorMessage(error)); setLoading(false); return; }
    const list = (data ?? []) as Family[];
    setFamilies(list);
    setFamilyId((cur) => cur ?? list[0]?.id ?? null);
    setError(null);
    setLoading(false);
  }, []);

  const loadChildren = useCallback(async () => {
    if (!familyId) { setChildren([]); return; }
    const { data, error } = await supabase.from("children").select("*").eq("family_id", familyId).order("created_at");
    if (error) { setError(errorMessage(error)); return; }
    const list = (data ?? []) as Child[];
    setChildren(list);
    setChildId((cur) => (cur && list.some((c) => c.id === cur)) ? cur : list[0]?.id ?? null);
    setError(null);
  }, [familyId]);

  useEffect(() => { void loadFamilies(); }, [loadFamilies]);
  useEffect(() => { void loadChildren(); }, [loadChildren]);
  useEffect(() => { try { localStorage.setItem("cp.view", view); } catch { /* ignore */ } }, [view]);

  const obs = useObservation(childId);
  const st = obs.status[0];

  if (loading) return <div className="center muted">{t("app.loading")}</div>;
  // En cas d'erreur de chargement sans aucune famille connue, afficher l'erreur
  // (et proposer de réessayer) plutôt que l'écran « Créer une famille » à tort.
  if (error && families.length === 0) {
    return (
      <div className="center">
        <div className="card" style={{ width: 360 }}>
          <h2>{t("dashboard.loadFailed")}</h2>
          <p className="msg error">{error}</p>
          <button onClick={() => { setError(null); void loadFamilies(); }}>{t("dashboard.retry")}</button>
        </div>
      </div>
    );
  }
  if (families.length === 0) {
    return <div className="center"><CreateFamily onCreated={loadFamilies} /></div>;
  }

  const themeIcon = theme === "light" ? "☀" : theme === "dark" ? "☾" : "⌁";
  const themeTitle = t(`dashboard.theme.${theme}`);
  const currentChild = children.find((c) => c.id === childId) ?? null;
  const currentFamily = families.find((f) => f.id === familyId) ?? null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="dot">✦</span> {t("dashboard.brand")}</div>
        {NAV.map((n) => (
          <button key={n.key} className={`nav-item ${view === n.key ? "active" : ""}`} onClick={() => setView(n.key)}>
            <span className="ic">{n.icon}</span> {t(`nav.${n.key}`)}
          </button>
        ))}
        <div className="foot">
          <div style={{ marginBottom: 8, color: "var(--sidebar-text)", wordBreak: "break-all" }}>{session.user.email}</div>
          {t("dashboard.footerTagline")}<br />
          {t("dashboard.footerPrivacy")}
          <LanguageSwitcher />
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0 }}>{t(`dashboard.viewTitle.${view}`)}</h1>
            {currentFamily && (
              <span
                title={t("dashboard.familyBadgeTitle")}
                style={{
                  fontSize: "1.3rem", fontWeight: 800, color: "var(--primary)",
                  background: "color-mix(in srgb, var(--primary) 12%, transparent)",
                  padding: "2px 14px", borderRadius: 999, lineHeight: 1.5,
                }}
              >
                {currentFamily.name}
              </span>
            )}
          </div>
          <span className="spacer" />

          {families.length > 1 && (
            <select value={familyId ?? ""} onChange={(e) => { setFamilyId(e.target.value); setChildId(null); }}>
              {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          {children.length > 0 && view !== "family" && view !== "requests" && (
            <select value={childId ?? ""} onChange={(e) => setChildId(e.target.value)}>
              {children.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          )}
          {st && (
            <span className="badge" title={t("dashboard.deviceStatusTitle")}>
              {st.is_charging ? "⚡" : "🔋"} {t("dashboard.deviceStatus", { battery: st.battery_level ?? t("common.none"), storage: fmtBytes(st.storage_free_bytes) })}
            </span>
          )}
          <button className="ghost" title={themeTitle} aria-label={themeTitle} onClick={cycleTheme}>{themeIcon}</button>
          <button className="link" onClick={() => supabase.auth.signOut()}>{t("dashboard.signOut")}</button>
        </div>

        {error && <p className="msg error">{error}</p>}
        {obs.error && <p className="msg error">{obs.error}</p>}
        <ProtectionBanner childId={childId} status={obs.status} devices={obs.devices} />

        {view === "family" ? (
          <FamilyView familyId={familyId!} onChildrenChanged={loadChildren} />
        ) : view === "requests" ? (
          <RequestsView familyId={familyId!} children={children} />
        ) : !childId || !currentChild ? (
          <div className="card"><p className="empty"><Trans k="dashboard.noChild" tags={{ b: (c) => <b>{c}</b> }} /></p></div>
        ) : view === "rules" ? (
          <RulesView familyId={familyId!} child={currentChild} obs={obs} />
        ) : view === "messages" ? (
          <MessagesView familyId={familyId!} child={currentChild} />
        ) : view === "filter" ? (
          <FilteringView familyId={familyId!} child={currentChild} />
        ) : view === "location" ? (
          <LocationView familyId={familyId!} child={currentChild} />
        ) : view === "security" ? (
          <SecurityView familyId={familyId!} child={currentChild} />
        ) : view === "wellbeing" ? (
          <SafetyView familyId={familyId!} child={currentChild} />
        ) : view === "privacy" ? (
          <PrivacyView family={currentFamily!} child={currentChild}
            onChanged={() => { void loadFamilies(); void loadChildren(); }} />
        ) : obs.loading ? (
          <p className="muted">{t("dashboard.loadingData")}</p>
        ) : view === "overview" ? <OverviewView obs={obs} />
          : view === "screen" ? <ScreenTimeView obs={obs} />
          : view === "apps" ? <ApplicationsView obs={obs} />
          : <CallsView obs={obs} />}
      </main>
    </div>
  );
}

// LOT 8b — bannière TRANSPARENTE : signale au parent qu'une protection ATTENDUE a
// été désactivée sur l'appareil. Jamais de contenu, seulement l'état.
//
// Les booléens device_status.perm_* reflètent l'état OS COURANT (accordée/non), pas
// une transition. Pour éviter la fausse alerte permanente (fatigue d'alerte → le
// parent ignore la bannière et rate une vraie révocation), on ne signale une
// permission que si la fonction associée est RÉELLEMENT attendue pour cet enfant :
//   - usage / notifications : supervision cœur + transparence → toujours attendues ;
//   - localisation : seulement si le partage est activé (location_settings) ;
//   - superposition (overlay) : seulement en mode Standard (en Renforcé le blocage
//     passe par Device Policy Manager, l'overlay est légitimement absent).
// On ignore aussi les appareils RÉVOQUÉS (cohérent avec les autres vues).
type ProtectionKey = "perm_usage_access" | "perm_overlay" | "perm_notifications" | "perm_location";

function ProtectionBanner({ childId, status, devices }: {
  childId: string | null;
  status: DeviceStatus[];
  devices: Device[];
}) {
  const { t } = useI18n();
  // La localisation n'est « attendue » que si le partage est activé pour l'enfant.
  const [locationExpected, setLocationExpected] = useState(false);
  useEffect(() => {
    let active = true;
    if (!childId) { setLocationExpected(false); return; }
    void (async () => {
      const { data } = await supabase.from("location_settings")
        .select("enabled,mode").eq("child_id", childId).maybeSingle();
      if (active) setLocationExpected(!!data && data.enabled === true && data.mode !== "off");
    })();
    return () => { active = false; };
  }, [childId]);

  // Appareils ACTIFS (non révoqués) uniquement — un appareil retiré ne doit pas
  // maintenir la bannière rouge jusqu'à la purge de rétention.
  const liveDevices = new Map(devices.filter((d) => !d.revoked_at).map((d) => [d.id, d]));

  const off = new Set<ProtectionKey>();
  for (const s of status) {
    const dev = liveDevices.get(s.device_id);
    if (!dev) continue;                       // appareil révoqué / inconnu → ignoré
    if (s.perm_usage_access === false) off.add("perm_usage_access");
    if (s.perm_notifications === false) off.add("perm_notifications");
    if (s.perm_location === false && locationExpected) off.add("perm_location");
    if (s.perm_overlay === false && dev.mode === "standard") off.add("perm_overlay");
  }
  if (off.size === 0) return null;
  const labels = [...off].map((k) => t(`enums.protection.${k}`)).join(t("dashboard.protection.separator"));
  return (
    <div className="card" style={{ borderColor: "var(--danger)", marginBottom: 14 }}>
      <strong style={{ color: "var(--danger)" }}>{t("dashboard.protection.title")}</strong>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        <Trans k="dashboard.protection.body" params={{ labels }} tags={{ b: (c) => <b>{c}</b> }} />
      </p>
    </div>
  );
}

function CreateFamily({ onCreated }: { onCreated: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    // RPC SECURITY DEFINER (migration 0027) : remplace l'Edge Function create-family,
    // qui échouait faute de clé service_role fiable côté Edge Functions.
    const { error } = await supabase.rpc("create_family", { p_name: name });
    setBusy(false);
    if (error) { setErr(errorMessage(error)); return; }
    setName("");
    onCreated();
  }

  return (
    <form onSubmit={create} className="card" style={{ width: 360 }}>
      <h2>{t("dashboard.createFamily.title")}</h2>
      <input placeholder={t("dashboard.createFamily.namePlaceholder")} value={name} required onChange={(e) => setName(e.target.value)} />
      <button disabled={busy || !name.trim()} type="submit">{busy ? t("common.busy") : t("dashboard.createFamily.submit")}</button>
      {err && <span className="msg error">{err}</span>}
    </form>
  );
}
