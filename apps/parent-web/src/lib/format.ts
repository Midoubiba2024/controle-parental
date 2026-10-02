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

/* --- Catégories d'apps : libellé FR + slot de couleur de série ---------- */
const CATEGORY_ORDER = [
  "social", "game", "video", "audio", "productivity", "maps", "news", "image", "other",
] as const;

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

/** Slot de série (1..8) stable pour une catégorie → variable CSS --series-N. */
export function categorySeries(cat: string | null): number {
  const idx = CATEGORY_ORDER.indexOf((cat ?? "other") as (typeof CATEGORY_ORDER)[number]);
  return ((idx < 0 ? CATEGORY_ORDER.length - 1 : idx) % 8) + 1;
}

export function categoryColor(cat: string | null): string {
  return `var(--series-${categorySeries(cat)})`;
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
