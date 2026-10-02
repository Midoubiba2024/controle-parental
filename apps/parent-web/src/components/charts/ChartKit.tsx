import { useState, type ReactNode } from "react";

/* =============================================================================
   Boîte à outils de graphiques (SVG, sans dépendance). Couleurs = variables CSS
   --series-N (palette data-viz validée, CVD-safe). Tooltips au survol ;
   légendes + labels directs côté vues (identité jamais portée par la couleur
   seule). Thème clair/sombre hérité via les tokens CSS.
   ============================================================================= */

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;      // ex. "var(--series-1)"
}

interface Tip { x: number; y: number; node: ReactNode }

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.node}
    </div>
  );
}

/** Anneau (répartition du jour par catégorie). */
export function Donut({
  data, size = 190, thickness = 26, center, fmt,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  center?: { primary: string; secondary?: string };
  fmt: (v: number) => string;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 ? Math.min(2, c * 0.01) : 0;

  let offset = 0;
  const segs = total > 0 ? data.filter((d) => d.value > 0).map((d) => {
    const frac = d.value / total;
    const len = Math.max(frac * c - gap, 0.5);
    const seg = { d, len, dash: `${len} ${c - len}`, off: -offset };
    offset += frac * c;
    return seg;
  }) : [];

  return (
    <div style={{ position: "relative", width: size, margin: "0 auto" }}>
      <svg width={size} height={size} className="chart" role="img"
        aria-label={`Répartition : total ${center?.primary ?? fmt(total)}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {segs.map((s) => (
          <circle
            key={s.d.key}
            cx={cx} cy={cx} r={r} fill="none"
            stroke={s.d.color} strokeWidth={thickness}
            strokeDasharray={s.dash} strokeDashoffset={s.off}
            transform={`rotate(-90 ${cx} ${cx})`}
            style={{ cursor: "pointer", transition: "opacity .12s" }}
            onMouseMove={(e) => setTip({
              x: e.clientX, y: e.clientY,
              node: <><span className="k">{s.d.label} · </span>
                <span className="v">{fmt(s.d.value)}</span>
                <span className="k"> ({Math.round((s.d.value / total) * 100)}%)</span></>,
            })}
            onMouseLeave={() => setTip(null)}
          />
        ))}
      </svg>
      {center && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", pointerEvents: "none",
        }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-.02em" }}>{center.primary}</div>
          {center.secondary && <div className="muted small">{center.secondary}</div>}
        </div>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Barres verticales (ex. 7 derniers jours). [highlightKey] ressort en corail. */
export function Bars({
  data, height = 200, fmt, highlightKey,
}: {
  data: Slice[];
  height?: number;
  fmt: (v: number) => string;
  highlightKey?: string;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length || 1;
  const padB = 22;
  const plotH = height - padB;
  const gap = 10;
  const bw = `calc((100% - ${(n - 1) * gap}px) / ${n})`;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap, alignItems: "flex-end", height }}>
        {data.map((d) => {
          const h = Math.max((d.value / max) * plotH, d.value > 0 ? 3 : 0);
          const hot = d.key === highlightKey;
          return (
            <div key={d.key} style={{ width: bw, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height }}>
              <div
                className="bar"
                style={{
                  width: "100%", height: h, borderRadius: "5px 5px 0 0",
                  background: hot ? "var(--primary)" : d.color, cursor: "pointer",
                }}
                onMouseMove={(e) => setTip({
                  x: e.clientX, y: e.clientY,
                  node: <><span className="k">{d.label} · </span><span className="v">{fmt(d.value)}</span></>,
                })}
                onMouseLeave={() => setTip(null)}
              />
              <div className="tick" style={{ marginTop: 6, height: padB - 6, lineHeight: 1 }}>{d.label}</div>
            </div>
          );
        })}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Barres horizontales avec label direct (ex. top apps). */
export function HBars({
  data, fmt, maxRows = 8,
}: {
  data: Slice[];
  fmt: (v: number) => string;
  maxRows?: number;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const rows = data.slice(0, maxRows);
  const max = Math.max(1, ...rows.map((d) => d.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11, position: "relative" }}>
      {rows.map((d) => (
        <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 120, fontSize: ".86rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>
          <div style={{ flex: 1, background: "var(--surface-2)", borderRadius: 99, height: 12 }}>
            <div
              className="bar"
              style={{ width: `${Math.max((d.value / max) * 100, 2)}%`, height: "100%", borderRadius: 99, background: d.color, cursor: "pointer" }}
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, node: <><span className="k">{d.label} · </span><span className="v">{fmt(d.value)}</span></> })}
              onMouseLeave={() => setTip(null)}
            />
          </div>
          <div style={{ width: 66, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: ".84rem", fontWeight: 600 }}>{fmt(d.value)}</div>
        </div>
      ))}
      {rows.length === 0 && <p className="empty">Aucune donnée.</p>}
      <Tooltip tip={tip} />
    </div>
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
