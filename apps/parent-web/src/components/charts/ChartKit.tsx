import { useState, type ReactNode } from "react";
import { Trans, useI18n } from "../../i18n";

/* =============================================================================
   Boîte à outils de graphiques (SVG/HTML, sans dépendance). Palette « Cocon »
   (variables CSS --series-N, validée : luminance, chroma, séparation CVD) ;
   histogrammes en sable avec le jour de référence en corail. Tooltips au
   survol ; légendes + libellés directs côté vues (identité jamais portée par la
   couleur seule). Thème clair/sombre hérité via les jetons CSS.
   ============================================================================= */

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;      // ex. "var(--series-1)"
  tick?: string;      // libellé court de l'axe (sinon `label`)
}

interface Tip { x: number; y: number; node: ReactNode }

/** Balises des infobulles : <k> = libellé atténué, <v> = valeur. */
const TIP_TAGS = {
  k: (c: ReactNode) => <span className="k">{c}</span>,
  v: (c: ReactNode) => <span className="v">{c}</span>,
};

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.node}
    </div>
  );
}

/** Anneau (répartition par catégorie). */
export function Donut({
  data, size = 176, thickness = 22, center, fmt,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  center?: { primary: string; secondary?: string };
  fmt: (v: number) => string;
}) {
  const { t } = useI18n();
  const [tip, setTip] = useState<Tip | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const c = 2 * Math.PI * r;
  const visible = data.filter((d) => d.value > 0);
  // Espace de 2 px (couleur de surface) entre segments, sauf s'il n'y en a qu'un.
  const gap = visible.length > 1 ? 2 : 0;

  let offset = 0;
  const segs = total > 0 ? visible.map((d) => {
    const frac = d.value / total;
    const len = Math.max(frac * c - gap, 0.5);
    const seg = { d, len, dash: `${len} ${c - len}`, off: -offset };
    offset += frac * c;
    return seg;
  }) : [];

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="chart" role="img"
        aria-label={t("views.charts.donutAriaLabel", { total: center?.primary ?? fmt(total) })}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--c-track)" strokeWidth={thickness} />
        {segs.map((s) => (
          <circle
            key={s.d.key}
            className="bar"
            cx={cx} cy={cx} r={r} fill="none"
            stroke={s.d.color} strokeWidth={thickness}
            strokeDasharray={s.dash} strokeDashoffset={s.off}
            transform={`rotate(-90 ${cx} ${cx})`}
            style={{ cursor: "pointer" }}
            onMouseMove={(e) => setTip({
              x: e.clientX, y: e.clientY,
              node: <Trans k="views.charts.tooltipWithPercent" tags={TIP_TAGS}
                params={{ label: s.d.label, value: fmt(s.d.value), pct: Math.round((s.d.value / total) * 100) }} />,
            })}
            onMouseLeave={() => setTip(null)}
          />
        ))}
      </svg>
      {center && (
        <div className="donut-center">
          <span className="p">{center.primary}</span>
          {center.secondary && <span className="s">{center.secondary}</span>}
        </div>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/**
 * Histogramme vertical (ex. 7 derniers jours).
 * - [highlightKey] : jour de référence, en corail ;
 * - [limits] : limite quotidienne de CHAQUE jour (même unité que value, null =
 *   aucune) → trait pointillé par colonne, barre plus foncée si dépassée ;
 * - valeurs affichées au-dessus des barres quand il y en a peu (≤ 10).
 */
export function Bars({
  data, height = 200, fmt, valueFmt, highlightKey, limits, limitLabel,
}: {
  data: Slice[];
  height?: number;
  fmt: (v: number) => string;
  valueFmt?: (v: number) => string;
  highlightKey?: string;
  limits?: (number | null)[];
  limitLabel?: ReactNode;
}) {
  const { t } = useI18n();
  const [tip, setTip] = useState<Tip | null>(null);
  const n = data.length || 1;
  const dense = n > 10;
  const showValues = !dense;
  const labelSpace = showValues ? 22 : 4;
  const plotH = height - labelSpace;
  const max = Math.max(1, ...data.map((d) => d.value), ...(limits ?? []).map((l) => l ?? 0));
  const gap = dense ? 4 : 14;
  const hasLimit = !!limits?.some((l) => l != null);
  const constantLimit = hasLimit && limits!.every((l) => l === limits![0]) ? limits![0] : null;
  const pad = constantLimit != null && limitLabel ? 60 : 0;
  const aria = data.map((d) => t("views.charts.point", { label: d.label, value: fmt(d.value) }))
    .join(t("views.charts.pointSeparator"));

  return (
    // Axe TEMPOREL : toujours gauche→droite, même en RTL (convention des
    // graphiques chronologiques) ; les libellés gardent leur propre sens.
    <div className="bars" role="img" aria-label={aria}>
      <div className="bars-plot" style={{ height, gap, paddingInlineStart: pad }}>
        {constantLimit != null && limitLabel && (
          <div className="bars-limit-label" style={{ insetBlockEnd: (constantLimit / max) * plotH - 16, width: pad - 6 }}>
            {limitLabel}
          </div>
        )}
        {data.map((d, i) => {
          const lim = limits?.[i] ?? null;
          const h = Math.max((d.value / max) * plotH, d.value > 0 ? 3 : 0);
          const hot = d.key === highlightKey;
          const over = lim != null && d.value > lim * 1;
          const bg = hot ? "var(--c-accent)" : over ? "var(--chart-bar-over)" : d.color;
          return (
            <div key={d.key} className={`bars-col${hot ? " hot" : ""}${over && !hot ? " over" : ""}${dense ? " dense" : ""}`}>
              {showValues && <span className="val">{d.value > 0 ? (valueFmt ?? fmt)(d.value) : ""}</span>}
              <div
                className="b bar"
                style={{
                  height: h, background: bg,
                  boxShadow: hot ? "var(--shadow-bar)" : undefined,
                }}
                onMouseMove={(e) => setTip({
                  x: e.clientX, y: e.clientY,
                  node: <Trans k="views.charts.tooltip" tags={TIP_TAGS} params={{ label: d.label, value: fmt(d.value) }} />,
                })}
                onMouseLeave={() => setTip(null)}
              />
              {lim != null && <span className="lim" style={{ insetBlockEnd: (lim / max) * plotH }} />}
            </div>
          );
        })}
      </div>
      <div className="bars-x" style={{ gap, paddingInlineStart: pad }} aria-hidden="true">
        {data.map((d) => (
          <span key={d.key} className={d.key === highlightKey ? "hot" : undefined}>{d.tick ?? d.label}</span>
        ))}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Barres horizontales avec libellé direct (ex. top apps). Miroir en RTL. */
export function HBars({
  data, fmt, maxRows = 8,
}: {
  data: Slice[];
  fmt: (v: number) => string;
  maxRows?: number;
}) {
  const { t } = useI18n();
  const rows = data.slice(0, maxRows);
  const max = Math.max(1, ...rows.map((d) => d.value));
  if (rows.length === 0) return <p className="empty">{t("views.charts.noData")}</p>;
  return (
    <ul className="cat-list">
      {rows.map((d) => (
        <li key={d.key} style={{ gap: 12 }}>
          <span className="lbl" style={{ flex: "0 1 38%" }}>{d.label}</span>
          <span style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--c-track)" }} aria-hidden="true">
            <span style={{ display: "block", width: `${Math.max((d.value / max) * 100, 2)}%`, height: 8, borderRadius: 4, background: d.color }} />
          </span>
          <span className="val" style={{ minWidth: 64, textAlign: "end" }}>{fmt(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Légende partagée (identité ≠ couleur seule). */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span className="it" key={it.label}>
          <span className="sw" style={{ background: it.color }} /> {it.label}
        </span>
      ))}
    </div>
  );
}

/** Liste « pastille · libellé · valeur » : légende détaillée d'un anneau. */
export function CategoryList({ items, fmt }: { items: Slice[]; fmt: (v: number) => string }) {
  return (
    <ul className="cat-list">
      {items.map((s) => (
        <li key={s.key}>
          <span className="sw" style={{ background: s.color }} />
          <span className="lbl">{s.label}</span>
          <span className="val">{fmt(s.value)}</span>
        </li>
      ))}
    </ul>
  );
}
