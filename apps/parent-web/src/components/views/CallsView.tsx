import { labelMap, t, Trans, useI18n } from "../../i18n";
import type { ObservationData } from "../../lib/observation";
import { fmtDateTime, fmtDuration } from "../../lib/format";
import { Info, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Timer } from "lucide-react";
import { Tile, EmptyState } from "../Ui";
import { ic } from "../icons";
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
    <div className="stack" style={{ gap: 20 }}>
      <div className="banner info">
        <span className="banner-ic"><Info {...ic} /></span>
        <div style={{ paddingTop: 8 }}>
          <Trans k="views.calls.notice" tags={{
            b: (c) => <strong>{c}</strong>,
            muted: (c) => <span className="muted">{c}</span>,
          }} />
        </div>
      </div>

      {comms.length === 0 ? (
        <div className="card">
          <EmptyState icon={Phone} title={t("views.calls.emptyTitle")}
            hint={t("views.calls.emptyHint")} />
        </div>
      ) : (
        <>
          <div className="grid cols-4">
            <Tile label={t("views.calls.tiles.incoming")} value={counts.in} icon={PhoneIncoming} tone="sage" />
            <Tile label={t("views.calls.tiles.outgoing")} value={counts.out} icon={PhoneOutgoing} tone="plum" />
            <Tile label={t("views.calls.tiles.unanswered")} value={counts.unanswered} icon={PhoneMissed} tone="danger" />
            <Tile label={t("views.calls.tiles.totalDuration")} value={fmtDuration(counts.duration)} icon={Timer} tone="sand" />
          </div>

          <div className="card">
            <h2><Trans k="views.calls.logTitle" params={{ total: counts.total }}
              tags={{ muted: (c) => <span className="muted small">{c}</span> }} /></h2>
            <div className="tbl-wrap"><table className="tbl">
              <thead>
                <tr>
                  <th>{t("views.calls.columns.counterparty")}</th>
                  <th>{t("views.calls.columns.direction")}</th>
                  <th>{t("views.calls.columns.duration")}</th>
                  <th>{t("views.calls.columns.date")}</th>
                </tr>
              </thead>
              <tbody>
                {comms.map((c) => (
                  <tr key={c.id}>
                    <td>{counterparty(c)}</td>
                    <td data-label={t("common.cellLabel", { label: t("views.calls.columns.direction") })}>
                      <span className={`pill ${c.direction}`}>{DIR_LABEL[c.direction]}</span></td>
                    <td data-label={t("common.cellLabel", { label: t("views.calls.columns.duration") })}>
                      {connected(c) ? fmtDuration(c.duration_ms ?? 0) : t("common.none")}</td>
                    <td className="muted" data-label={t("common.cellLabel", { label: t("views.calls.columns.date") })}>
                      {fmtDateTime(c.occurred_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </>
      )}
    </div>
  );
}

function counterparty(c: CommEvent): string {
  // Le numéro n'est jamais en clair : « Correspondant · a91f3c » (identifiant
  // masqué STABLE) ; « Numéro masqué » seulement pour un appel réellement anonyme.
  if (c.counterparty_hash) return t("views.calls.counterpartyWithId", { id: c.counterparty_hash.slice(0, 6) });
  return t("views.calls.hiddenNumber");
}
