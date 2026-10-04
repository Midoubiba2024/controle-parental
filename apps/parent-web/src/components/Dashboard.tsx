import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import type { Session } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import {
  CalendarClock, Clock3, Funnel, House, Inbox, LayoutDashboard, LayoutGrid, Lock, LogOut, MapPin,
  Menu, MessageCircle, Monitor, Moon, Phone, ShieldAlert, Sun, TriangleAlert, UserRoundCheck, Users, X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useObservation } from "../lib/observation";
import { fmtAgo, fmtBytes } from "../lib/format";
import { ageProfileLabel } from "../lib/labels";
import { errorMessage, Trans, useI18n } from "../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ic, Logo } from "./icons";
import type { Child, Device, DeviceStatus, Family } from "../lib/types";

/* --- Vues chargées À LA DEMANDE (un chunk par vue) ------------------------ */
// Le premier écran ne télécharge que la coquille + la vue active ; Leaflet n'est
// chargé que par Localisation / Sécurité.
const named = <K extends string, P>(load: () => Promise<Record<K, ComponentType<P>>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const OverviewView = named(() => import("./views/OverviewView"), "OverviewView");
const ScreenTimeView = named(() => import("./views/ScreenTimeView"), "ScreenTimeView");
const ApplicationsView = named(() => import("./views/ApplicationsView"), "ApplicationsView");
const CallsView = named(() => import("./views/CallsView"), "CallsView");
const FamilyView = named(() => import("./views/FamilyView"), "FamilyView");
const RulesView = named(() => import("./views/RulesView"), "RulesView");
const RequestsView = named(() => import("./views/RequestsView"), "RequestsView");
const MessagesView = named(() => import("./views/MessagesView"), "MessagesView");
const LocationView = named(() => import("./views/LocationView"), "LocationView");
const SecurityView = named(() => import("./views/SecurityView"), "SecurityView");
const FilteringView = named(() => import("./views/FilteringView"), "FilteringView");
const SafetyView = named(() => import("./views/SafetyView"), "SafetyView");
const PrivacyView = named(() => import("./views/PrivacyView"), "PrivacyView");

export type View =
  | "overview" | "screen" | "apps" | "calls" | "rules" | "filter"
  | "location" | "security" | "wellbeing" | "requests" | "messages" | "family" | "privacy";

// Navigation en 4 sections titrées. Libellés : nav.<vue> ; sections :
// dashboard.navSections.<section> ; titres de page : dashboard.viewTitle.<vue>.
const NAV: { section: "follow" | "protect" | "exchange" | "account"; items: { key: View; icon: LucideIcon }[] }[] = [
  { section: "follow", items: [
    { key: "overview", icon: LayoutDashboard },
    { key: "screen", icon: Clock3 },
    { key: "apps", icon: LayoutGrid },
    { key: "calls", icon: Phone },
  ] },
  { section: "protect", items: [
    { key: "rules", icon: CalendarClock },
    { key: "filter", icon: Funnel },
    { key: "location", icon: MapPin },
    { key: "security", icon: ShieldAlert },
    { key: "wellbeing", icon: UserRoundCheck },
  ] },
  { section: "exchange", items: [
    { key: "requests", icon: Inbox },
    { key: "messages", icon: MessageCircle },
  ] },
  { section: "account", items: [
    { key: "family", icon: Users },
    { key: "privacy", icon: Lock },
  ] },
];
const ALL_VIEWS = NAV.flatMap((s) => s.items.map((i) => i.key));

// Au-delà de ce délai, la pastille d'appareil passe en ton neutre (relevé ancien).
const FRESH_MS = 30 * 60_000;
const MOBILE_QUERY = "(max-width: 900px)";

export function Dashboard({ session }: { session: Session }) {
  const { t, fmt, locale } = useI18n();
  const [families, setFamilies] = useState<Family[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  // Onglet mémorisé entre rafraîchissements (évite de « perdre » la vue Famille au
  // rechargement — les données ne sont jamais perdues, seul l'onglet actif change).
  const [view, setView] = useState<View>(() => {
    try {
      const saved = localStorage.getItem("cp.view") as View | null;
      return saved && ALL_VIEWS.includes(saved) ? saved : "overview";
    } catch { return "overview"; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, cycleTheme] = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);

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

  // --- Tiroir mobile : Échap / voile ferment, focus piégé puis rendu ---------
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    menuBtnRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!drawerOpen) return;
    const panel = sidebarRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], select, input, [tabindex]:not([tabindex='-1'])") ?? []);
    (panel?.querySelector<HTMLElement>("[aria-current='page']") ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeDrawer(); return; }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Repasser en grand écran ferme le tiroir (sinon le défilement resterait bloqué).
    const mq = window.matchMedia(MOBILE_QUERY);
    const onMq = () => { if (!mq.matches) setDrawerOpen(false); };
    mq.addEventListener("change", onMq);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      mq.removeEventListener("change", onMq);
    };
  }, [drawerOpen, closeDrawer]);

  const obs = useObservation(childId);

  if (loading) return <div className="center muted">{t("app.loading")}</div>;
  // En cas d'erreur de chargement sans aucune famille connue, afficher l'erreur
  // (et proposer de réessayer) plutôt que l'écran « Créer une famille » à tort.
  if (error && families.length === 0) {
    return (
      <div className="center">
        <div className="card" style={{ width: "min(400px, 100%)" }}>
          <h2>{t("dashboard.loadFailed")}</h2>
          <p className="msg error" style={{ marginBottom: 16 }}>{error}</p>
          <button onClick={() => { setError(null); void loadFamilies(); }}>{t("dashboard.retry")}</button>
        </div>
      </div>
    );
  }
  if (families.length === 0) {
    return <div className="center"><CreateFamily onCreated={loadFamilies} /></div>;
  }

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const themeTitle = t(`dashboard.theme.${theme}`);
  const currentChild = children.find((c) => c.id === childId) ?? null;
  const currentFamily = families.find((f) => f.id === familyId) ?? null;
  const showChildPicker = children.length > 0 && view !== "family" && view !== "requests";

  // Pastille d'appareil : uniquement si un relevé RÉEL existe pour un appareil actif.
  const liveIds = new Set(obs.devices.filter((d) => !d.revoked_at).map((d) => d.id));
  const st = obs.status.find((s) => liveIds.has(s.device_id)) ?? null;
  const fresh = st ? Date.now() - new Date(st.captured_at).getTime() < FRESH_MS : false;

  const today = fmt.date(new Date(), { weekday: "long", day: "numeric", month: "long" });
  const todayCap = today.charAt(0).toLocaleUpperCase(locale) + today.slice(1);

  function go(v: View) {
    setView(v);
    if (drawerOpen) closeDrawer();
  }

  return (
    <div className={`shell${drawerOpen ? " drawer-open" : ""}`}>
      <aside className="sidebar" id="sidebar" ref={sidebarRef}
        {...(drawerOpen ? { role: "dialog", "aria-modal": true, "aria-label": t("dashboard.navLabel") } : {})}>
        <div className="row between" style={{ flexWrap: "nowrap", gap: 8 }}>
          <div className="brand">
            <span className="brand-logo"><Logo /></span>
            <span className="brand-text">
              <span className="brand-name">{t("dashboard.brand")}</span>
              <span className="brand-sub">{t("dashboard.brandSub")}</span>
            </span>
          </div>
          {drawerOpen && (
            <button type="button" className="icon-btn mobile-only" onClick={closeDrawer}
              aria-label={t("dashboard.closeMenu")}
              style={{ background: "transparent", color: "var(--c-side-ink)", borderColor: "var(--c-side-line)" }}>
              <X {...ic} />
            </button>
          )}
        </div>

        <nav className="nav" aria-label={t("dashboard.navLabel")}>
          {NAV.map((s) => (
            <div className="nav-section" key={s.section}>
              <p className="nav-title" id={`nav-${s.section}`}>{t(`dashboard.navSections.${s.section}`)}</p>
              <ul className="nav-section" aria-labelledby={`nav-${s.section}`} style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {s.items.map(({ key, icon: Icon }) => (
                  <li key={key}>
                    <button type="button" className="nav-item" onClick={() => go(key)}
                      aria-current={view === key ? "page" : undefined}>
                      <Icon {...ic} className="nav-ic" />
                      <span className="nav-label">{t(`nav.${key}`)}</span>
                      {view === key && <span className="nav-dot" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <p className="sidebar-email">{session.user.email}</p>
          <p className="sidebar-note">{t("dashboard.footerTagline")} {t("dashboard.footerPrivacy")}</p>
          <LanguageSwitcher />
        </div>
      </aside>
      <div className="scrim" aria-hidden="true" onClick={closeDrawer} />

      <main className="main" id="main">
        <header className="header">
          <div className="header-top">
            <button type="button" ref={menuBtnRef} className="icon-btn menu-btn"
              aria-label={t("dashboard.openMenu")} aria-expanded={drawerOpen} aria-controls="sidebar"
              onClick={() => setDrawerOpen(true)}>
              <Menu {...ic} />
            </button>
            <p className="header-date">
              {currentChild && view !== "family" && view !== "requests"
                ? t("dashboard.headerDateWithProfile", { date: todayCap, profile: ageProfileLabel(currentChild.age_profile) })
                : t("dashboard.headerDate", { date: todayCap })}
            </p>
            <div className="header-ctl">
              {families.length > 1 && (
                <div className="picker">
                  <label htmlFor="family-picker">{t("dashboard.familyLabel")}</label>
                  <select id="family-picker" value={familyId ?? ""}
                    onChange={(e) => { setFamilyId(e.target.value); setChildId(null); }}>
                    {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              {showChildPicker && (
                <div className="picker">
                  <span className="avatar" aria-hidden="true">{initial(currentChild?.display_name)}</span>
                  <label htmlFor="child-picker">{t("dashboard.childLabel")}</label>
                  <select id="child-picker" value={childId ?? ""} onChange={(e) => setChildId(e.target.value)}>
                    {children.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                  </select>
                </div>
              )}
              {showChildPicker && st && currentChild && (
                <div className={`status-pill${fresh ? "" : " stale"}`} role="status"
                  title={t("dashboard.deviceStatus", {
                    battery: st.battery_level ?? t("common.none"), storage: fmtBytes(st.storage_free_bytes),
                  })}>
                  <span className="dot" aria-hidden="true" />
                  {t("dashboard.deviceFreshness", { name: currentChild.display_name, ago: fmtAgo(st.captured_at) })}
                </div>
              )}
              <div className="header-actions">
                <button type="button" className="icon-btn" title={themeTitle} aria-label={themeTitle} onClick={cycleTheme}>
                  <ThemeIcon {...ic} />
                </button>
                <button type="button" className="ghost" onClick={() => supabase.auth.signOut()}
                  aria-label={t("dashboard.signOut")}>
                  <LogOut {...ic} size={18} />
                  <span className="signout-label">{t("dashboard.signOut")}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="header-title">
            <h1>{t(`dashboard.viewTitle.${view}`)}</h1>
            {currentFamily && (
              <span className="family-tag" title={t("dashboard.familyBadgeTitle")}>
                <span className="ic" aria-hidden="true"><House {...ic} size={18} strokeWidth={2} /></span>
                <span className="visually-hidden">{t("dashboard.familyBadgeTitle")} : </span>
                <span className="name">{currentFamily.name}</span>
              </span>
            )}
          </div>
        </header>

        {error && <p className="msg error">{error}</p>}
        {obs.error && <p className="msg error">{obs.error}</p>}
        <ProtectionBanner childId={childId} status={obs.status} devices={obs.devices} />

        <Suspense fallback={<ViewSkeleton />}>
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
            <ViewSkeleton />
          ) : view === "overview" ? <OverviewView obs={obs} child={currentChild} onNavigate={go} />
            : view === "screen" ? <ScreenTimeView obs={obs} />
            : view === "apps" ? <ApplicationsView obs={obs} />
            : <CallsView obs={obs} />}
        </Suspense>
      </main>
    </div>
  );
}

function initial(name: string | null | undefined): string {
  const first = (name ?? "").trim().charAt(0);
  return first ? first.toLocaleUpperCase() : "·";
}

/** Repli élégant pendant le chargement d'une vue (squelette, sans animation si réduite). */
function ViewSkeleton() {
  const { t } = useI18n();
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">{t("dashboard.loadingView")}</span>
      <div className="grid cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="sk" style={{ height: 132 }} />)}
      </div>
      <div className="grid dash-wide">
        <div className="sk" style={{ height: 300 }} />
        <div className="sk" style={{ height: 300 }} />
      </div>
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
    <div className="banner danger" role="alert">
      <span className="banner-ic"><TriangleAlert {...ic} /></span>
      <div>
        <strong>{t("dashboard.protection.title")}</strong>
        <p><Trans k="dashboard.protection.body" params={{ labels }} tags={{ b: (c) => <b>{c}</b> }} /></p>
      </div>
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
    <form onSubmit={create} className="card" style={{ width: "min(420px, 100%)" }}>
      <div className="brand" style={{ padding: 0, color: "var(--c-ink)" }}>
        <span className="brand-logo"><Logo /></span>
        <h1 style={{ fontSize: 26 }}>{t("dashboard.createFamily.title")}</h1>
      </div>
      <input aria-label={t("dashboard.createFamily.namePlaceholder")} placeholder={t("dashboard.createFamily.namePlaceholder")}
        value={name} required onChange={(e) => setName(e.target.value)} />
      <button disabled={busy || !name.trim()} type="submit">{busy ? t("common.busy") : t("dashboard.createFamily.submit")}</button>
      {err && <span className="msg error">{err}</span>}
    </form>
  );
}
