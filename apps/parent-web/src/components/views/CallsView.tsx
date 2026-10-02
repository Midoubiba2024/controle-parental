import type { ObservationData } from "../../lib/observation";
import { fmtDateTime, fmtDuration } from "../../lib/format";
import { Tile, EmptyState } from "../Ui";
import type { CommDirection, CommEvent } from "../../lib/types";

const DIR_LABEL: Record<CommDirection, string> = {
  incoming: "Entrant", outgoing: "Sortant", missed: "Manqué",
  rejected: "Rejeté", blocked: "Bloqué",
};

export function CallsView({ obs }: { obs: ObservationData }) {
  const { comms } = obs;

  // « non aboutis » = manqués + rejetés + bloqués (aucune durée). On les regroupe
  // explicitement et on affiche la tuile (plutôt que de les diluer en silence).
  const counts = comms.reduce((acc, c) => {
    acc.total++;
    if (c.direction === "incoming") acc.in++;
    else if (c.direction === "outgoing") acc.out++;
    else acc.unanswered++;      // missed | rejected | blocked
    acc.duration += c.duration_ms ?? 0;
    return acc;
  }, { total: 0, in: 0, out: 0, unanswered: 0, duration: 0 });

  const connected = (c: CommEvent) => c.direction === "incoming" || c.direction === "outgoing";

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="card" style={{ borderLeft: "3px solid var(--primary)" }}>
        <strong>Métadonnées uniquement.</strong>{" "}
        <span className="muted">Qui (numéro jamais stocké en clair), quand et combien de temps —
        jamais le contenu des appels, qui n'est ni écouté ni enregistré. Ces informations sont
        aussi visibles par l'enfant.</span>
      </div>

      {comms.length === 0 ? (
        <div className="card">
          <EmptyState icon="📞" title="Aucune métadonnée d'appel"
            hint="Cette fonction est facultative et sensible (permission READ_CALL_LOG). Elle est désactivée par défaut dans l'app enfant et n'est collectée qu'avec le consentement explicite." />
        </div>
      ) : (
        <>
          <div className="grid cols-4">
            <Tile label="Entrants" value={counts.in} icon="📥"
              iconBg="color-mix(in srgb, var(--series-3) 18%, transparent)" />
            <Tile label="Sortants" value={counts.out} icon="📤"
              iconBg="color-mix(in srgb, var(--series-1) 18%, transparent)" />
            <Tile label="Manqués / rejetés" value={counts.unanswered} icon="📵"
              iconBg="color-mix(in srgb, var(--danger) 16%, transparent)" />
            <Tile label="Durée totale" value={fmtDuration(counts.duration)} icon="⏱"
              iconBg="color-mix(in srgb, var(--series-4) 20%, transparent)" />
          </div>

          <div className="card">
            <h2>Journal des appels <span className="muted small">(métadonnées · {counts.total} au total)</span></h2>
            <table className="tbl">
              <thead>
                <tr><th>Sens</th><th>Correspondant</th><th>Durée</th><th>Date</th></tr>
              </thead>
              <tbody>
                {comms.map((c) => (
                  <tr key={c.id}>
                    <td><span className={`pill ${c.direction}`}>{DIR_LABEL[c.direction]}</span></td>
                    <td>{counterparty(c)}</td>
                    <td>{connected(c) ? fmtDuration(c.duration_ms ?? 0) : "—"}</td>
                    <td className="muted">{fmtDateTime(c.occurred_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function counterparty(c: CommEvent): string {
  // Le numéro n'est jamais en clair ; on affiche un identifiant de regroupement
  // stable (préfixe du hash) ou « Numéro masqué ».
  if (c.counterparty_hash) return `Numéro masqué · ${c.counterparty_hash.slice(0, 6)}`;
  return "Numéro masqué";
}
