/* Helpers de formatage (durées, octets, dates) + mapping catégorie→couleur. */
import { fmt, t } from "../i18n";

// Formats dépendant de la langue : délèguent au module i18n (Intl.* + langue active).
/** Durée lisible à partir de millisecondes : « 2 h 35 », « 48 min », « 40 s ». */
export const fmtDuration = fmt.duration;
/** Durée courte pour axes : « 2h », « 45m ». */
export const fmtDurationShort = fmt.durationShort;
export const fmtBytes = fmt.bytes;
export const fmtDateTime = fmt.dateTime;
/** Temps écoulé lisible : « à l'instant », « il y a 5 min », « il y a 2 h ». */
export const fmtAgo = fmt.ago;
/** day = YYYY-MM-DD → « lun. 30 ». */
export const fmtDayLabel = fmt.dayLabel;

/**
 * Clé de jour (YYYY-MM-DD) d'un horodatage ISO, dans le fuseau du NAVIGATEUR
 * parent. Utilisée pour regrouper les trajets par jour côté console. NB : c'est
 * une approximation côté parent (l'appareil enfant peut être dans un autre
 * fuseau) ; acceptable pour un regroupement d'affichage, à ne pas confondre avec
 * `anchorDay` (jour de référence des agrégats, lui dérivé du fuseau de l'appareil).
 */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Clé de jour locale (YYYY-MM-DD) décalée de [offset] jours par rapport à aujourd'hui. */
export function dayKey(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Décale une clé de jour (YYYY-MM-DD) de [delta] jours, par pur calcul de dates
 * (sans dépendre du fuseau). Utilisé pour dériver les plages d'affichage à partir
 * du jour de référence issu des DONNÉES (voir useObservation.anchorDay), afin de
 * ne pas mélanger le fuseau du navigateur parent et celui de l'appareil enfant.
 */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* --- Catégories d'apps : libellé traduit + slot de couleur de série ---------- */
// 8 catégories nommées → 8 séries de la palette (CVD-safe). « other » n'a PAS de
// série dédiée (il n'y a que 8 séries) : il prend une couleur NEUTRE, pour qu'aucune
// autre catégorie ne partage sa teinte (cf. skill dataviz : pas deux entités de
// même couleur dans un donut/une légende).
const CATEGORY_SERIES: Record<string, number> = {
  social: 1, game: 2, video: 3, audio: 4, productivity: 5, maps: 6, news: 7, image: 8,
};

type AppCategory = "social" | "game" | "video" | "audio" | "productivity" | "maps" | "news" | "image" | "other";

export function categoryLabel(cat: string | null): string {
  const key = (cat && Object.prototype.hasOwnProperty.call(CATEGORY_SERIES, cat) ? cat : "other") as AppCategory;
  return t(`enums.appCategory.${key}`);
}

/** Slot de série (1..8) d'une catégorie, ou 0 pour « other » (couleur neutre). */
export function categorySeries(cat: string | null): number {
  return CATEGORY_SERIES[cat ?? "other"] ?? 0;
}

export function categoryColor(cat: string | null): string {
  const s = categorySeries(cat);
  return s === 0 ? "var(--muted)" : `var(--series-${s})`;
}

export function appLabelOf(label: string | null, pkg: string): string {
  if (label && label.trim()) return label;
  const parts = pkg.split(".");
  return parts[parts.length - 1] || pkg;
}

/** Initiales pour l'icône de tuile d'app. */
export function appInitials(label: string | null, pkg: string): string {
  const name = appLabelOf(label, pkg);
  return name.slice(0, 2).toUpperCase();
}

/**
 * Libellé COURT de l'axe des jours d'un histogramme (le libellé complet reste
 * dans l'aria-label et l'infobulle) : jour de la semaine abrégé sur 7 jours,
 * numéro du jour un jour sur trois sur 30 jours (jamais de date tronquée).
 */
export function dayTick(day: string, period: number, index: number): string {
  const d = new Date(day + "T00:00:00");
  if (period <= 7) return fmt.date(d, { weekday: "short" });
  return index % 3 === 0 ? fmt.date(d, { day: "numeric" }) : "";
}
