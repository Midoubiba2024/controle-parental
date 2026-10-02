/* Helpers de formatage (durées, octets, dates) + mapping catégorie→couleur. */

/** Durée lisible à partir de millisecondes : « 2 h 35 », « 48 min », « 40 s ». */
export function fmtDuration(ms: number): string {
  if (!ms || ms < 0) return "0 min";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return `${Math.round(ms / 1000)} s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Durée courte pour axes : « 2h », « 45m ». */
export function fmtDurationShort(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

export function fmtBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  const u = ["o", "Ko", "Mo", "Go", "To"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/** Temps écoulé lisible : « à l'instant », « il y a 5 min », « il y a 2 h ». */
export function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "à l'instant";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export function fmtDayLabel(day: string): string {
  // day = YYYY-MM-DD → « lun. 30 »
  const d = new Date(day + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
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

/* --- Catégories d'apps : libellé FR + slot de couleur de série ---------- */
// 8 catégories nommées → 8 séries de la palette (CVD-safe). « other » n'a PAS de
// série dédiée (il n'y a que 8 séries) : il prend une couleur NEUTRE, pour qu'aucune
// autre catégorie ne partage sa teinte (cf. skill dataviz : pas deux entités de
// même couleur dans un donut/une légende).
const CATEGORY_SERIES: Record<string, number> = {
  social: 1, game: 2, video: 3, audio: 4, productivity: 5, maps: 6, news: 7, image: 8,
};

const CATEGORY_LABELS: Record<string, string> = {
  social: "Réseaux sociaux",
  game: "Jeux",
  video: "Vidéo",
  audio: "Audio / musique",
  productivity: "Productivité",
  maps: "Cartes",
  news: "Actualités",
  image: "Photo / image",
  other: "Autres",
};

export function categoryLabel(cat: string | null): string {
  return CATEGORY_LABELS[cat ?? "other"] ?? CATEGORY_LABELS.other;
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
