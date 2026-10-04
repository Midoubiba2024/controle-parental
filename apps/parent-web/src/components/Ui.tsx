import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useI18n } from "../i18n";
import { ic, icSm } from "./icons";

export type Tone = "accent" | "plum" | "sage" | "sand" | "danger" | "neutral";

/** Tuile statistique : libellé, pastille d'icône, grand chiffre en serif. */
export function Tile({
  label, value, icon: Icon, tone = "neutral", delta, foot,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  delta?: { pct: number | null; invert?: boolean };
  foot?: ReactNode;
}) {
  const { t, fmt } = useI18n();
  const pct = delta?.pct;
  // pct === 0 : état NEUTRE (ni hausse ni baisse) — pas de flèche trompeuse.
  const dir = pct == null ? null : pct === 0 ? "flat" : (delta?.invert ? -pct : pct) > 0 ? "up" : "down";
  const TrendIcon = pct == null ? null : pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  return (
    <div className="card tile">
      <div className="tile-head">
        <span className="tile-label">{label}</span>
        {Icon && <span className={`tile-ic tone-${tone}`}><Icon {...ic} size={18} /></span>}
      </div>
      <div className="tile-value">{value}</div>
      {(dir || foot) && (
        <div className="tile-foot">
          {dir && TrendIcon && (
            <span className={`trend ${dir}`}>
              <TrendIcon {...icSm} size={14} />
              {t("ui.tile.deltaVsPrevious", { pct: fmt.percent(pct!, true) })}
            </span>
          )}
          {foot}
        </div>
      )}
    </div>
  );
}

export function Meter({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="meter" aria-hidden="true"><span style={{ width: `${pct}%`, background: color }} /></div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon?: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="empty">
      {Icon && <span className="empty-ic"><Icon {...ic} size={22} /></span>}
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  );
}

/** En-tête de carte : titre (h2, Fraunces) + sous-titre + action optionnelle. */
export function CardHead({ title, sub, action, icon: Icon, tone = "plum", id }: {
  title: ReactNode; sub?: ReactNode; action?: ReactNode; icon?: LucideIcon; tone?: Tone; id?: string;
}) {
  const heading = (
    <div>
      <h2 id={id}>{title}</h2>
      {sub && <p className="card-sub">{sub}</p>}
    </div>
  );
  return (
    <div className="card-head">
      {Icon
        ? <div className="card-title-ic"><span className={`tile-ic tone-${tone}`} style={{ width: 40, height: 40 }}><Icon {...ic} /></span>{heading}</div>
        : heading}
      {action}
    </div>
  );
}

/** Repli élégant pendant un chargement (squelette ; sans animation si mouvement réduit). */
export function ViewSkeleton({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="skeleton" role="status">
      <span className="visually-hidden">{t("dashboard.loadingView")}</span>
      {!compact && (
        <div className="grid cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="sk" style={{ height: 132 }} />)}
        </div>
      )}
      <div className="grid dash-wide">
        <div className="sk" style={{ height: 300 }} />
        <div className="sk" style={{ height: 300 }} />
      </div>
    </div>
  );
}

/**
 * Liste tronquée : n'affiche que `limit` éléments, avec un fondu et un bouton
 * « Afficher les N autres » (puis « Afficher moins »). Aucun défilement imbriqué.
 */
export function useShowMore<T>(items: T[], limit: number) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const hidden = Math.max(0, items.length - limit);
  const visible = open || hidden === 0 ? items : items.slice(0, limit);
  const button = hidden > 0 ? (
    <div className="show-more">
      <button type="button" className="link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? t("common.showLess") : t("common.showMore", { count: hidden })}
      </button>
    </div>
  ) : null;
  return { visible, button, truncated: !open && hidden > 0 };
}
