import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { REQUEST_KIND_LABEL } from "../../lib/rules";
import { fmtDateTime } from "../../lib/format";
import { EmptyState } from "../Ui";
import type { AccessRequest, Child } from "../../lib/types";

/* =============================================================================
   LOT 2 — Demandes (co-régulation transparente). L'enfant demande (temps sup.,
   déblocage) ; le parent approuve/refuse. Le parent peut aussi octroyer un bonus
   ou proposer une récompense. Toute décision est tracée (audit + visible enfant).
   ============================================================================= */

export function RequestsView({ familyId, children }: { familyId: string; children: Child[] }) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const childName = useMemo(() => {
    const m = new Map(children.map((c) => [c.id, c.display_name]));
    return (id: string) => m.get(id) ?? "—";
  }, [children]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("requests").select("*")
      .eq("family_id", familyId).order("created_at", { ascending: false }).limit(100);
    if (error) setErr(error.message); else { setRequests(data as AccessRequest[]); setErr(null); }
  }, [familyId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function decide(req: AccessRequest, approve: boolean, note?: string) {
    setBusy(true); setErr(null);
    const { data: auth } = await supabase.auth.getUser();
    const decided_by = auth.user?.id ?? null;
    const status = approve ? "approved" : "denied";

    // Effet de l'approbation selon le type de demande.
    if (approve) {
      if (req.kind === "extra_time" || req.kind === "reward") {
        const minutes = Math.max(0, Number(req.payload?.minutes ?? 0));
        if (minutes > 0) {
          const scope_package = req.payload?.scope === "app" ? (req.payload?.package_name ?? null) : null;
          const { error: gErr } = await supabase.from("time_grants").insert({
            family_id: familyId, child_id: req.child_id, bonus_minutes: minutes,
            scope_package, source: req.kind === "reward" ? "reward" : "request", request_id: req.id,
          });
          if (gErr) { setErr(gErr.message); setBusy(false); return; }
        }
      } else if (req.kind === "unblock_app" && req.payload?.package_name) {
        const { error: rErr } = await supabase.from("app_rules").upsert(
          { family_id: familyId, child_id: req.child_id, target_type: "package",
            target_value: String(req.payload.package_name), action: "allow", daily_limit_minutes: null },
          { onConflict: "child_id,target_type,target_value" });
        if (rErr) { setErr(rErr.message); setBusy(false); return; }
      }
    }

    const { error } = await supabase.from("requests")
      .update({ status, decided_by, decided_at: new Date().toISOString(), parent_note: note ?? null })
      .eq("id", req.id);
    setBusy(false);
    if (error) setErr(error.message); else refresh();
  }

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  return (
    <div className="grid dash" style={{ gap: 18 }}>
      <div className="card">
        <h2>En attente <span className="muted small">({pending.length})</span></h2>
        {err && <p className="msg error">{err}</p>}
        {pending.length === 0 && <EmptyState icon="🙌" title="Aucune demande en attente"
          hint="Les demandes de temps ou de déblocage de l'enfant apparaissent ici." />}
        {pending.map((req) => (
          <div key={req.id} style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{childName(req.child_id)}</strong>
              <span className="badge">{REQUEST_KIND_LABEL[req.kind]}</span>
            </div>
            <p className="small" style={{ margin: "6px 0" }}>{describe(req)}</p>
            {req.child_note && <p className="muted small" style={{ margin: "4px 0" }}>« {req.child_note} »</p>}
            <div className="muted small">{fmtDateTime(req.created_at)}</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button disabled={busy} onClick={() => decide(req, true)}>Approuver</button>
              <button className="ghost" disabled={busy} onClick={() => decide(req, false)}>Refuser</button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <GrantBonusCard familyId={familyId} children={children} onDone={refresh} />
        <div className="card" style={{ marginTop: 18 }}>
          <h2>Historique</h2>
          {history.length === 0 && <EmptyState title="Aucune décision pour l'instant." />}
          <ul className="scroll" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {history.map((req) => (
              <li key={req.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: ".88rem" }}>
                <span className="pill" style={{ marginRight: 8 }}>{statusLabel(req.status)}</span>
                <b>{childName(req.child_id)}</b> · {REQUEST_KIND_LABEL[req.kind]} · {describe(req)}
                <div className="muted small">{req.decided_at ? fmtDateTime(req.decided_at) : fmtDateTime(req.created_at)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function GrantBonusCard({ familyId, children, onDone }: {
  familyId: string; children: Child[]; onDone: () => void;
}) {
  const [childId, setChildId] = useState(children[0]?.id ?? "");
  const [minutes, setMinutes] = useState("15");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const m = Math.max(0, parseInt(minutes, 10) || 0);
    const { error } = await supabase.from("time_grants").insert({
      family_id: familyId, child_id: childId, bonus_minutes: m, source: "manual",
    });
    setBusy(false);
    if (error) setErr(error.message); else onDone();
  }

  if (children.length === 0) return null;
  return (
    <div className="card">
      <h2>Octroyer un bonus</h2>
      <p className="muted small" style={{ marginTop: -8 }}>Ajoute des minutes au quota du jour (récompense).</p>
      <form className="inline" onSubmit={grant}>
        {children.length > 1 && (
          <select value={childId} onChange={(e) => setChildId(e.target.value)}>
            {children.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
          </select>
        )}
        <input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ width: 90 }} />
        <span className="muted small">min</span>
        <button disabled={busy} type="submit">Offrir</button>
      </form>
      {err && <p className="msg error">{err}</p>}
    </div>
  );
}

function describe(req: AccessRequest): string {
  const m = req.payload?.minutes;
  const pkg = req.payload?.package_name;
  if (req.kind === "extra_time") return `+${m ?? "?"} min${req.payload?.scope === "app" && pkg ? ` sur ${pkg}` : " (global)"}`;
  if (req.kind === "reward") return `+${m ?? "?"} min de récompense`;
  if (req.kind === "unblock_app") return `Débloquer ${pkg ?? "une app"}`;
  return "";
}

function statusLabel(s: AccessRequest["status"]): string {
  return s === "approved" ? "Approuvée" : s === "denied" ? "Refusée" : s === "cancelled" ? "Annulée" : "En attente";
}
