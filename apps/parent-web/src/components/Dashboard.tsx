import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useObservation } from "../lib/observation";
import { fmtBytes } from "../lib/format";
import type { Child, Family } from "../lib/types";
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

type View =
  | "overview" | "screen" | "apps" | "calls" | "rules" | "filter"
  | "location" | "security" | "requests" | "messages" | "family";

const NAV: { key: View; label: string; icon: string }[] = [
  { key: "overview", label: "Vue d'ensemble", icon: "◎" },
  { key: "screen", label: "Temps d'écran", icon: "⏱" },
  { key: "apps", label: "Applications", icon: "▦" },
  { key: "calls", label: "Appels", icon: "☏" },
  { key: "rules", label: "Règles d'accès", icon: "⛬" },
  { key: "filter", label: "Filtrage", icon: "🛡" },
  { key: "location", label: "Localisation", icon: "📍" },
  { key: "security", label: "Sécurité / SOS", icon: "🆘" },
  { key: "requests", label: "Demandes", icon: "✉" },
  { key: "messages", label: "Messages", icon: "💬" },
  { key: "family", label: "Famille", icon: "⌂" },
];

const VIEW_TITLE: Record<View, string> = {
  overview: "Vue d'ensemble", screen: "Temps d'écran", apps: "Applications",
  calls: "Appels", rules: "Règles d'accès", filter: "Filtrage web & contenu",
  location: "Localisation", security: "Sécurité & SOS", requests: "Demandes",
  messages: "Messages", family: "Famille & appareils",
};

export function Dashboard({ session }: { session: Session }) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, cycleTheme] = useTheme();

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    // On ne retombe sur une liste vide (→ écran « Créer une famille ») QUE sur un
    // succès. Une erreur (réseau/RLS) ne doit pas masquer les familles existantes.
    const { data, error } = await supabase.from("families").select("id,name,created_at").order("created_at");
    if (error) { setError(error.message); setLoading(false); return; }
    const list = (data ?? []) as Family[];
    setFamilies(list);
    setFamilyId((cur) => cur ?? list[0]?.id ?? null);
    setError(null);
    setLoading(false);
  }, []);

  const loadChildren = useCallback(async () => {
    if (!familyId) { setChildren([]); return; }
    const { data, error } = await supabase.from("children").select("*").eq("family_id", familyId).order("created_at");
    if (error) { setError(error.message); return; }
    const list = (data ?? []) as Child[];
    setChildren(list);
    setChildId((cur) => (cur && list.some((c) => c.id === cur)) ? cur : list[0]?.id ?? null);
    setError(null);
  }, [familyId]);

  useEffect(() => { void loadFamilies(); }, [loadFamilies]);
  useEffect(() => { void loadChildren(); }, [loadChildren]);

  const obs = useObservation(childId);
  const st = obs.status[0];

  if (loading) return <div className="center muted">Chargement…</div>;
  // En cas d'erreur de chargement sans aucune famille connue, afficher l'erreur
  // (et proposer de réessayer) plutôt que l'écran « Créer une famille » à tort.
  if (error && families.length === 0) {
    return (
      <div className="center">
        <div className="card" style={{ width: 360 }}>
          <h2>Chargement impossible</h2>
          <p className="msg error">{error}</p>
          <button onClick={() => { setError(null); void loadFamilies(); }}>Réessayer</button>
        </div>
      </div>
    );
  }
  if (families.length === 0) {
    return <div className="center"><CreateFamily onCreated={loadFamilies} /></div>;
  }

  const themeIcon = theme === "light" ? "☀" : theme === "dark" ? "☾" : "⌁";
  const themeTitle = theme === "light" ? "Thème clair" : theme === "dark" ? "Thème sombre" : "Thème système";
  const currentChild = children.find((c) => c.id === childId) ?? null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="dot">✦</span> Supervision</div>
        {NAV.map((n) => (
          <button key={n.key} className={`nav-item ${view === n.key ? "active" : ""}`} onClick={() => setView(n.key)}>
            <span className="ic">{n.icon}</span> {n.label}
          </button>
        ))}
        <div className="foot">
          <div style={{ marginBottom: 8, color: "var(--sidebar-text)", wordBreak: "break-all" }}>{session.user.email}</div>
          Contrôle parental transparent.<br />
          Métadonnées & agrégats seulement — jamais le contenu.
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <div>
            <h1>{VIEW_TITLE[view]}</h1>
            {currentChild && <div className="sub">{currentChild.display_name}</div>}
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
            <span className="badge" title="État de l'appareil (dernier relevé)">
              {st.is_charging ? "⚡" : "🔋"} {st.battery_level ?? "—"}% · 💾 {fmtBytes(st.storage_free_bytes)}
            </span>
          )}
          <button className="ghost" title={themeTitle} onClick={cycleTheme}>{themeIcon}</button>
          <button className="link" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
        </div>

        {error && <p className="msg error">{error}</p>}
        {obs.error && <p className="msg error">{obs.error}</p>}

        {view === "family" ? (
          <FamilyView familyId={familyId!} onChildrenChanged={loadChildren} />
        ) : view === "requests" ? (
          <RequestsView familyId={familyId!} children={children} />
        ) : !childId || !currentChild ? (
          <div className="card"><p className="empty">Ajoutez un enfant dans l'onglet <b>Famille</b> pour voir ses données.</p></div>
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
        ) : obs.loading ? (
          <p className="muted">Chargement des données…</p>
        ) : view === "overview" ? <OverviewView obs={obs} />
          : view === "screen" ? <ScreenTimeView obs={obs} />
          : view === "apps" ? <ApplicationsView obs={obs} />
          : <CallsView obs={obs} />}
      </main>
    </div>
  );
}

function CreateFamily({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.functions.invoke("create-family", { body: { name } });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setName("");
    onCreated();
  }

  return (
    <form onSubmit={create} className="card" style={{ width: 360 }}>
      <h2>Créer une famille</h2>
      <input placeholder="Nom du foyer" value={name} required onChange={(e) => setName(e.target.value)} />
      <button disabled={busy || !name.trim()} type="submit">{busy ? "…" : "Créer la famille"}</button>
      {err && <span className="msg error">{err}</span>}
    </form>
  );
}
