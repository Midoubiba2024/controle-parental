import type { ReactNode } from "react";
import { useI18n } from "../i18n";

export function Tile({
  label, value, icon, iconBg, delta,
}: {
  label: string;
  value: ReactNode;
  icon?: string;
  iconBg?: string;
  delta?: { pct: number | null; invert?: boolean; label?: string };
}) {
  const { t } = useI18n();
  return (
    <div className="card tile">
      <div className="label">
        {icon && <span className="ic-badge" style={{ background: iconBg ?? "var(--surface-2)" }}>{icon}</span>}
        {label}
      </div>
      <div className="value">{value}</div>
      {delta && delta.pct != null && (
        // pct === 0 : état NEUTRE (ni hausse ni baisse) — pas de flèche rouge trompeuse.
        <div className={`delta ${delta.pct === 0 ? "flat" : (delta.invert ? -delta.pct : delta.pct) > 0 ? "up" : "down"}`}>
          {delta.pct > 0 ? "▲" : delta.pct < 0 ? "▼" : "■"} {t("ui.tile.deltaPct", { pct: Math.abs(delta.pct) })} {delta.label ?? t("ui.tile.vsPrevious")}
        </div>
      )}
    </div>
  );
}

export function Meter({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="meter"><span style={{ width: `${pct}%`, background: color }} /></div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      {icon && <div className="big">{icon}</div>}
      <p style={{ margin: "6px 0 2px", fontWeight: 600 }}>{title}</p>
      {hint && <p className="small" style={{ margin: 0 }}>{hint}</p>}
    </div>
  );
}
