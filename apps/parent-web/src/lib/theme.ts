import { useSyncExternalStore } from "react";

/* -----------------------------------------------------------------------------
   APPARENCE de la console : deux axes INDÉPENDANTS sur <html> :
     - data-palette = identité visuelle (cocon | clarte | jardin) ;
     - data-theme   = mode (light | dark ; absent = réglage du système).

   Petit magasin (useSyncExternalStore) partagé par le bouton soleil/lune de
   l'en-tête et la page Réglages : un changement d'un côté se voit de l'autre.

   Persistance :
     - localStorage `cp.palette` et `cp.theme` (try/catch) : application
       instantanée, sans flash, par le script en ligne d'index.html ;
     - compte Supabase (user_metadata) : synchronisation entre appareils,
       cf. lib/appearanceSync.ts.

   AJOUTER UNE PALETTE : une entrée ici, ses jetons dans src/themes/<p>.css
   (+ @import dans styles.css), la même entrée dans le script d'index.html, ses
   polices dans src/fonts/<p>.css (+ FONT_LOADERS), ses libellés dans fr.ts
   (views.settings.palettes.<p>). `npm run check:theme` vérifie le tout.
   ----------------------------------------------------------------------------- */

export type Theme = "light" | "dark" | "system";

export const PALETTES = {
  // Couleur de fond (--c-bg) de chaque mode : sert à <meta name="theme-color">
  // (la barre du navigateur ne lit pas les variables CSS).
  // Recopiée dans src/themes/<p>.css, index.html (et le manifeste pour la
  // palette par défaut) : `npm run check:theme`.
  cocon: { light: "#FAF6EF", dark: "#170F18" },
  clarte: { light: "#EEF2F7", dark: "#0A1322" },
  jardin: { light: "#F4F7F2", dark: "#0E1611" },
} as const satisfies Record<string, { light: `#${string}`; dark: `#${string}` }>;
export type Palette = keyof typeof PALETTES;
export const DEFAULT_PALETTE: Palette = "cocon";
export const PALETTE_IDS = Object.keys(PALETTES) as Palette[];
export const THEMES: readonly Theme[] = ["light", "dark", "system"];

const PALETTE_KEY = "cp.palette";
const THEME_KEY = "cp.theme";
const LEGACY_THEME_KEY = "cp-theme";   // LOT 10 : relu une fois, puis migré

export function isPalette(v: unknown): v is Palette {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PALETTES, v);
}
export function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}

function readPalette(): Palette {
  try {
    const v = localStorage.getItem(PALETTE_KEY);
    if (isPalette(v)) return v;
  } catch { /* stockage indisponible */ }
  return DEFAULT_PALETTE;
}

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
    if (isTheme(v)) return v;
  } catch { /* stockage indisponible */ }
  return "system";
}

/** Une préférence a-t-elle été choisie sur CET appareil (clé présente) ? */
export function hasLocalAppearance(): boolean {
  try {
    return localStorage.getItem(PALETTE_KEY) !== null
      || localStorage.getItem(THEME_KEY) !== null
      || localStorage.getItem(LEGACY_THEME_KEY) !== null;
  } catch { return false; }
}

/* --- Polices à la demande ----------------------------------------------------
   Cocon (défaut) est dans le bundle principal (fonts.css). Les autres
   identités ne téléchargent RIEN tant qu'elles ne sont pas choisies : leur
   feuille @font-face est un chunk CSS séparé, et le navigateur ne récupère
   un fichier de police que si un texte l'utilise réellement.
   ----------------------------------------------------------------------------- */
const FONT_LOADERS: Partial<Record<Palette, () => Promise<unknown>>> = {
  clarte: () => import("../fonts/clarte.css"),
  jardin: () => import("../fonts/jardin.css"),
};
const fontLoads = new Map<Palette, Promise<void>>();
export function loadPaletteFonts(palette: Palette): Promise<void> {
  const load = FONT_LOADERS[palette];
  if (!load) return Promise.resolve();
  let p = fontLoads.get(palette);
  if (!p) {
    // Échec (hors ligne) : polices de repli, et une nouvelle tentative plus tard.
    p = load().then(() => undefined, () => { fontLoads.delete(palette); });
    fontLoads.set(palette, p);
  }
  return p;
}

/* --- Magasin ---------------------------------------------------------------- */
export type Appearance = { palette: Palette; theme: Theme };
/** Origine d'un changement : seul un choix de l'utilisateur part vers le compte. */
export type AppearanceOrigin = "user" | "account";

let state: Appearance = { palette: readPalette(), theme: readTheme() };
const listeners = new Set<() => void>();
const changeListeners = new Set<(a: Appearance, origin: AppearanceOrigin) => void>();

function apply({ palette, theme }: Appearance) {
  const root = document.documentElement;
  root.setAttribute("data-palette", palette);
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  syncThemeColor(theme, palette);
  void loadPaletteFonts(palette);
}

function persist({ palette, theme }: Appearance) {
  try {
    localStorage.setItem(PALETTE_KEY, palette);
    localStorage.setItem(THEME_KEY, theme);
    localStorage.removeItem(LEGACY_THEME_KEY);
  } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
}

/**
 * Change la palette et/ou le mode. Les valeurs sont VALIDÉES (une valeur
 * inconnue est ignorée) ; l'effet est immédiat, persistant et partagé.
 */
export function setAppearance(next: Partial<Appearance>, origin: AppearanceOrigin = "user") {
  const merged: Appearance = {
    palette: isPalette(next.palette) ? next.palette : state.palette,
    theme: isTheme(next.theme) ? next.theme : state.theme,
  };
  const changed = merged.palette !== state.palette || merged.theme !== state.theme;
  state = merged;
  persist(state);
  apply(state);
  if (!changed) return;
  listeners.forEach((l) => l());
  changeListeners.forEach((l) => l(state, origin));
}

export function getAppearance(): Appearance { return state; }

/** Abonnement hors React (synchronisation avec le compte). */
export function onAppearanceChange(fn: (a: Appearance, origin: AppearanceOrigin) => void): () => void {
  changeListeners.add(fn);
  return () => { changeListeners.delete(fn); };
}

/** Au démarrage (avant le premier rendu) : attributs, theme-color et polices. */
export function initAppearance() { apply(state); }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => state;

export function useAppearance(): Appearance & {
  setPalette: (p: Palette) => void;
  setTheme: (t: Theme) => void;
} {
  const a = useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    ...a,
    setPalette: (palette) => setAppearance({ palette }),
    setTheme: (theme) => setAppearance({ theme }),
  };
}

/** Raccourci de l'en-tête : clair → sombre → système → clair. */
export function useTheme(): [Theme, () => void] {
  const { theme } = useSyncExternalStore(subscribe, snapshot, snapshot);
  const cycle = () => {
    const next: Theme = state.theme === "light" ? "dark" : state.theme === "dark" ? "system" : "light";
    setAppearance({ theme: next });
  };
  return [theme, cycle];
}

/**
 * <meta name="theme-color"> suit la palette et le mode CHOISIS : en clair/sombre
 * forcé, une seule couleur effective ; en « système », les deux metas avec leur
 * media. (Même logique dans le script en ligne d'index.html, avant le premier rendu.)
 */
function syncThemeColor(theme: Theme, palette: Palette) {
  const colors = PALETTES[palette];
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    const scheme = m.dataset.scheme as "light" | "dark" | undefined;
    if (!scheme) return;
    if (theme === "system") {
      m.media = `(prefers-color-scheme: ${scheme})`;
      m.content = colors[scheme];
    } else {
      m.media = "all";
      m.content = colors[theme];
    }
  });
}
