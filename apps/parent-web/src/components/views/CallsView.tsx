import { labelMap, t, Trans, useI18n } from "../../i18n";
import type { ObservationData } from "../../lib/observation";
import { fmtDateTime, fmtDuration } from "../../lib/format";
import { Tile, EmptyState } from "../Ui";
import type { CommDirection, CommEvent } from "../../lib/types";

const DIR_LABEL: Readonly<Record<CommDirection, string>> = labelMap(
  ["incoming", "outgoing", "missed", "rejected", "blocked"] as const,
  (d) => t(`views.calls.direction.${d}`),
);

export function CallsView({ obs }: { obs: ObservationData }) {
  const { t } = useI18n();
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
      <div className="card" style={{ borderInlineStart: "3px solid var(--primary)" }}>
        <Trans k="views.calls.notice" tags={{
          b: (c) => <strong>{c}</strong>,
          muted: (c) => <span className="muted">{c}</span>,
        }} />
      </div>

      {comms.length === 0 ? (
        <div className="card">
          <EmptyState icon="📞" title={t("views.calls.emptyTitle")}
            hint={t("views.calls.emptyHint")} />
        </div>
      ) : (
        <>
          <div className="grid cols-4">
            <Tile label={t("views.calls.tiles.incoming")} value={counts.in} icon="📥"
              iconBg="color-mix(in srgb, var(--series-3) 18%, transparent)" />
            <Tile label={t("views.calls.tiles.outgoing")} value={counts.out} icon="📤"
              iconBg="color-mix(in srgb, var(--series-1) 18%, transparent)" />
            <Tile label={t("views.calls.tiles.unanswered")} value={counts.unanswered} icon="📵"
              iconBg="color-mix(in srgb, var(--danger) 16%, transparent)" />
            <Tile label={t("views.calls.tiles.totalDuration")} value={fmtDuration(counts.duration)} icon="⏱"
              iconBg="color-mix(in srgb, var(--series-4) 20%, transparent)" />
          </div>

          <div className="card">
            <h2><Trans k="views.calls.logTitle" params={{ total: counts.total }}
              tags={{ muted: (c) => <span className="muted small">{c}</span> }} /></h2>
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("views.calls.columns.direction")}</th>
                  <th>{t("views.calls.columns.counterparty")}</th>
                  <th>{t("views.calls.columns.duration")}</th>
                  <th>{t("views.calls.columns.date")}</th>
                </tr>
              </thead>
              <tbody>
                {comms.map((c) => (
                  <tr key={c.id}>
                    <td><span className={`pill ${c.direction}`}>{DIR_LABEL[c.direction]}</span></td>
                    <td>{counterparty(c)}</td>
                    <td>{connected(c) ? fmtDuration(c.duration_ms ?? 0) : t("common.none")}</td>
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
  if (c.counterparty_hash) return t("views.calls.hiddenNumberWithId", { id: c.counterparty_hash.slice(0, 6) });
  return t("views.calls.hiddenNumber");
}
