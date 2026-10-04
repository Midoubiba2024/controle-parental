import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, Trans, useI18n } from "../../i18n";
import { supabase } from "../../lib/supabase";
import { fmtDateTime } from "../../lib/format";
import { MessageCircle, Send } from "lucide-react";
import { EmptyState } from "../Ui";
import { ic } from "../icons";
import type { Child, Message } from "../../lib/types";

/* =============================================================================
   LOT 5 — Messagerie INTERNE parent ↔ enfant (H2/H4). Messagerie propriétaire
   uniquement : jamais d'interception d'apps tierces. Visible des deux côtés.
   Après envoi, on déclenche (best-effort) dispatch-push pour accélérer la
   livraison ; le polling de l'appareil reste le socle fiable.
   ============================================================================= */

export function MessagesView({ familyId, child }: { familyId: string; child: Child }) {
  const { t } = useI18n();
  const childId = child.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const childRef = useRef<string>(childId);

  // Fusionne une ligne (INSERT/UPDATE) dans le fil, dédupliquée par id, triée.
  const mergeRow = useCallback((row: Message) => {
    setMessages((cur) => {
      const rest = cur.filter((m) => m.id !== row.id);
      return [...rest, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("messages").select("*")
      .eq("child_id", childId).order("created_at", { ascending: true }).limit(300);
    if (error) { setErr(errorMessage(error)); return; }
    const list = (data ?? []) as Message[];
    setMessages(list);
    setErr(null);
    // Accusé de lecture des messages DE L'ENFANT encore non lus (sens de l'accusé :
    // le parent n'acquitte que les messages reçus ; seul read_at est modifiable).
    const unread = list.filter((m) => m.sender === "child" && !m.read_at).map((m) => m.id);
    if (unread.length > 0) {
      await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread);
    }
  }, [childId]);

  useEffect(() => { childRef.current = childId; void load(); }, [load, childId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  // Realtime (#6) : voit en direct les réponses de l'enfant et les accusés de
  // lecture, sans recharger. La RLS SELECT s'applique au flux.
  useEffect(() => {
    const channel = supabase
      .channel(`msg:${childId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `child_id=eq.${childId}` },
        (payload) => { if (childRef.current === childId) mergeRow(payload.new as Message); })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `child_id=eq.${childId}` },
        (payload) => { if (childRef.current === childId) mergeRow(payload.new as Message); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [childId, mergeRow]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("messages").insert({
      family_id: familyId, child_id: childId, sender: "parent", body: text,
    });
    setBusy(false);
    if (error) { setErr(errorMessage(error)); return; }
    setBody("");
    void load();
    // Accélération best-effort (ignore l'échec : le polling prendra le relais).
    void supabase.functions.invoke("dispatch-push", { body: { child_id: childId } }).catch(() => {});
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
      <h2><Trans k="views.messages.title" params={{ name: child.display_name }}
        tags={{ muted: (c) => <span className="muted small">{c}</span> }} /></h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        {t("views.messages.intro")}
      </p>

      <div className="scroll thread" style={{ maxHeight: "min(460px, 60dvh)" }} aria-live="polite">
        {messages.length === 0 && !err && <EmptyState icon={MessageCircle} title={t("views.messages.emptyTitle")}
          hint={t("views.messages.emptyHint")} />}
        {messages.map((m) => {
          const mine = m.sender === "parent";
          return (
            <div key={m.id} className={`bubble-wrap ${mine ? "mine" : "theirs"}`}>
              <div className="bubble">{m.body}</div>
              <div className="bubble-meta">
                {mine && m.read_at
                  ? t("views.messages.sentAtRead", { date: fmtDateTime(m.created_at) })
                  : fmtDateTime(m.created_at)}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {err && <p className="msg error">{err}</p>}
      <form onSubmit={send} className="inline" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--c-divider)", flexWrap: "nowrap", alignItems: "center" }}>
        <input aria-label={t("views.messages.placeholder")} placeholder={t("views.messages.placeholder")} value={body} maxLength={2000}
          onChange={(e) => setBody(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
        <button type="submit" disabled={busy || !body.trim()}><Send {...ic} size={18} />{busy ? t("common.busy") : t("views.messages.send")}</button>
      </form>
    </div>
  );
}
