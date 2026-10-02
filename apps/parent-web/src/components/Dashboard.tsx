import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  ageProfileFromBirth, type AuditEntry, type Child, type Device,
  type DeviceMode, type Family,
} from "../lib/types";

export function Dashboard({ session }: { session: Session }) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("families").select("id,name,created_at").order("created_at");
    if (error) setError(error.message);
    else {
      setFamilies(data as Family[]);
      setFamilyId((cur) => cur ?? data[0]?.id ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadFamilies(); }, [loadFamilies]);

  if (loading) return <p className="muted">Chargement…</p>;

  return (
    <div>
      <header className="topbar">
        <strong>Console parent</strong>
        <span className="spacer" />
        <span className="muted small">{session.user.email}</span>
        <button className="link" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
      </header>

      {error && <p className="msg error">{error}</p>}

      {families.length === 0 ? (
        <CreateFamily onCreated={loadFamilies} />
      ) : (
        <>
          <section className="row">
            <label>Famille
              <select value={familyId ?? ""} onChange={(e) => setFamilyId(e.target.value)}>
                {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <CreateFamily compact onCreated={loadFamilies} />
          </section>
          {familyId && <FamilyPanel key={familyId} familyId={familyId} />}
        </>
      )}
    </div>
  );
}

function CreateFamily({ onCreated, compact }: { onCreated: () => void; compact?: boolean }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    // Création atomique (famille + appartenance owner) via Edge Function.
    const { error } = await supabase.functions.invoke("create-family", { body: { name } });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setName("");
    onCreated();
  }

  return (
    <form onSubmit={create} className={compact ? "inline" : "card"}>
      {!compact && <h2>Créer une famille</h2>}
      <input placeholder="Nom du foyer" value={name} required
        onChange={(e) => setName(e.target.value)} />
      <button disabled={busy || !name.trim()} type="submit">
        {busy ? "…" : compact ? "+ Famille" : "Créer la famille"}
      </button>
      {err && <span className="msg error">{err}</span>}
    </form>
  );
}

function FamilyPanel({ familyId }: { familyId: string }) {
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
    if (c.error) setErr(c.error.message); else setChildren(c.data as Child[]);
    if (!d.error) setDevices(d.data as Device[]);
    if (!a.error) setAudit(a.data as AuditEntry[]);
  }, [familyId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <>
      {err && <p className="msg error">{err}</p>}
      <div className="grid">
        <section className="card">
          <h2>Enfants</h2>
          <AddChild familyId={familyId} onAdded={refresh} />
          {children.length === 0 && <p className="muted">Aucun enfant pour l'instant.</p>}
          {children.map((ch) => (
            <ChildRow key={ch.id} child={ch} devices={devices.filter((d) => d.child_id === ch.id)} />
          ))}
        </section>

        <section className="card">
          <h2>Journal d'audit <span className="muted small">(transparence)</span></h2>
          {audit.length === 0 && <p className="muted">Aucune activité.</p>}
          <ul className="audit">
            {audit.map((a) => (
              <li key={a.id}>
                <code>{a.action}</code>
                <span className="muted small"> · {a.actor_role ?? "—"} · {new Date(a.created_at).toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function AddChild({ familyId, onAdded }: { familyId: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.from("children").insert({
      family_id: familyId,
      display_name: name,
      birth_date: birth || null,
      age_profile: ageProfileFromBirth(birth || null),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setName(""); setBirth("");
    onAdded();
  }

  return (
    <form onSubmit={add} className="inline">
      <input placeholder="Prénom" value={name} required onChange={(e) => setName(e.target.value)} />
      <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
      <button disabled={busy || !name.trim()} type="submit">{busy ? "…" : "+ Enfant"}</button>
      {err && <span className="msg error">{err}</span>}
    </form>
  );
}

function ChildRow({ child, devices }: { child: Child; devices: Device[] }) {
  const [mode, setMode] = useState<DeviceMode>(child.age_profile === "young_child" ? "reinforced" : "standard");
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function genCode() {
    setBusy(true); setErr(null); setCode(null);
    const { data, error } = await supabase.functions.invoke("pairing-start", {
      body: { family_id: child.family_id, child_id: child.id, mode },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setCode(data as { code: string; expires_at: string });
  }

  return (
    <div className="child">
      <div className="child-head">
        <strong>{child.display_name}</strong>
        <span className="badge">{child.age_profile}</span>
      </div>
      <div className="inline">
        <select value={mode} onChange={(e) => setMode(e.target.value as DeviceMode)}>
          <option value="standard">Standard</option>
          <option value="reinforced">Renforcé</option>
        </select>
        <button disabled={busy} onClick={genCode}>{busy ? "…" : "Générer un code d'appairage"}</button>
      </div>
      {code && (
        <p className="code">
          Code : <b>{code.code}</b>
          <span className="muted small"> · expire {new Date(code.expires_at).toLocaleTimeString("fr-FR")}</span>
        </p>
      )}
      {err && <p className="msg error">{err}</p>}
      <div className="devices">
        {devices.length === 0 ? (
          <span className="muted small">Aucun appareil appairé.</span>
        ) : devices.map((d) => (
          <span key={d.id} className="device">
            📱 {d.label ?? d.model ?? d.platform} · {d.mode}
            {d.revoked_at ? " (révoqué)" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
