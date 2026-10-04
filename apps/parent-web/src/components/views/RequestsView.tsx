import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { REQUEST_KIND_LABEL } from "../../lib/rules";
import { fmtDateTime } from "../../lib/format";
import { errorMessage, t, Trans, useI18n } from "../../i18n";
import { EmptyState } from "../Ui";
import type { AccessRequest, Child } from "../../lib/types";

/* =============================================================================
   LOT 2 — Demandes (co-régulation transparente). L'enfant demande (temps sup.,
   déblocage) ; le parent approuve/refuse. Le parent peut aussi octroyer un bonus
   ou proposer une récompense. Toute décision est tracée (audit + visible enfant).
   ============================================================================= */

export function RequestsView({ familyId, children }: { familyId: string; children: Child[] }) {
  const { t } = useI18n();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const childName = useMemo(() => {
    const m = new Map(children.map((c) => [c.id, c.display_name]));
    return (id: string) => m.get(id) ?? t("common.none");
  }, [children, t]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("requests").select("*")
      .eq("family_id", familyId).order("created_at", { ascending: false }).limit(100);
    if (error) setErr(errorMessage(error)); else { setRequests(data as AccessRequest[]); setErr(null); }
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
          if (gErr) { setErr(errorMessage(gErr)); setBusy(false); return; }
        }
      } else if (req.kind === "unblock_app" && req.payload?.package_name) {
        const { error: rErr } = await supabase.from("app_rules").upsert(
          { family_id: familyId, child_id: req.child_id, target_type: "package",
            target_value: String(req.payload.package_name), action: "allow", daily_limit_minutes: null },
          { onConflict: "child_id,target_type,target_value" });
        if (rErr) { setErr(errorMessage(rErr)); setBusy(false); return; }
      } else if (req.kind === "browse" && req.payload?.domain) {
        // Ask-to-Browse (C6, LOT 4) : autorise le domaine demandé (liste blanche).
        const { error: rErr } = await supabase.from("filter_rules").upsert(
          { family_id: familyId, child_id: req.child_id,
            domain: String(req.payload.domain), action: "allow", note: "ask_to_browse" },
          { onConflict: "child_id,domain" });
        if (rErr) { setErr(errorMessage(rErr)); setBusy(false); return; }
      }
    }

    const { error } = await supabase.from("requests")
      .update({ status, decided_by, decided_at: new Date().toISOString(), parent_note: note ?? null })
      .eq("id", req.id);
    setBusy(false);
    if (error) setErr(errorMessage(error)); else refresh();
  }

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  return (
    <div className="grid dash" style={{ gap: 18 }}>
      <div className="card">
        <h2><Trans k="views.requests.pendingTitle" params={{ count: pending.length }}
          tags={{ count: (c) => <span className="muted small">{c}</span> }} /></h2>
        {err && <p className="msg error">{err}</p>}
        {pending.length === 0 && <EmptyState icon="🙌" title={t("views.requests.emptyPendingTitle")}
          hint={t("views.requests.emptyPendingHint")} />}
        {pending.map((req) => (
          <div key={req.id} style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{childName(req.child_id)}</strong>
              <span className="badge">{REQUEST_KIND_LABEL[req.kind]}</span>
            </div>
            <p className="small" style={{ margin: "6px 0" }}>{describe(req)}</p>
            {req.child_note && <p className="muted small" style={{ margin: "4px 0" }}>{t("views.requests.childNote", { note: req.child_note })}</p>}
            <div className="muted small">{fmtDateTime(req.created_at)}</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button disabled={busy} onClick={() => decide(req, true)}>{t("views.requests.approve")}</button>
              <button className="ghost" disabled={busy} onClick={() => decide(req, false)}>{t("views.requests.deny")}</button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <GrantBonusCard familyId={familyId} children={children} onDone={refresh} />
        <div className="card" style={{ marginTop: 18 }}>
          <h2>{t("views.requests.historyTitle")}</h2>
          {history.length === 0 && <EmptyState title={t("views.requests.emptyHistory")} />}
          <ul className="scroll" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {history.map((req) => (
              <li key={req.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: ".88rem" }}>
                <span className="pill" style={{ marginInlineEnd: 8 }}>{statusLabel(req.status)}</span>
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
  const { t } = useI18n();
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
    if (error) setErr(errorMessage(error)); else onDone();
  }

  if (children.length === 0) return null;
  return (
    <div className="card">
      <h2>{t("views.requests.grantBonus.title")}</h2>
      <p className="muted small" style={{ marginTop: -8 }}>{t("views.requests.grantBonus.hint")}</p>
      <form className="inline" onSubmit={grant}>
        {children.length > 1 && (
          <select value={childId} onChange={(e) => setChildId(e.target.value)}>
            {children.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
          </select>
        )}
        <input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ width: 90 }} />
        <span className="muted small">{t("views.requests.grantBonus.unit")}</span>
        <button disabled={busy} type="submit">{t("views.requests.grantBonus.submit")}</button>
      </form>
      {err && <p className="msg error">{err}</p>}
    </div>
  );
}

function describe(req: AccessRequest): string {
  const m = req.payload?.minutes;
  const minutes = m ?? t("views.requests.describe.unknownMinutes");
  const pkg = req.payload?.package_name;
  if (req.kind === "extra_time") {
    return req.payload?.scope === "app" && pkg
      ? t("views.requests.describe.extraTimeApp", { minutes, app: pkg })
      : t("views.requests.describe.extraTimeGlobal", { minutes });
  }
  if (req.kind === "reward") return t("views.requests.describe.reward", { minutes });
  if (req.kind === "unblock_app") {
    return pkg != null ? t("views.requests.describe.unblockApp", { app: pkg }) : t("views.requests.describe.unblockAnyApp");
  }
  if (req.kind === "browse") {
    const domain = req.payload?.domain;
    return domain != null ? t("views.requests.describe.browse", { domain }) : t("views.requests.describe.browseUnknown");
  }
  return "";
}

function statusLabel(s: AccessRequest["status"]): string {
  return s === "approved" || s === "denied" || s === "cancelled"
    ? t(`views.requests.status.${s}`)
    : t("views.requests.status.pending");
}
