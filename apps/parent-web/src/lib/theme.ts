import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "cp-theme";

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch { /* stockage indisponible */ }
  return "system";
}

/* -----------------------------------------------------------------------------
   Deux axes INDÉPENDANTS sur <html> :
     - data-theme   = mode (light | dark ; absent = réglage du système) ;
     - data-palette = identité visuelle. Seule « cocon » existe (LOT 10) ; le
       LOT 11 ajoutera « clarte » et « jardin » (ajouter l'entrée ici, ses
       jetons dans styles.css, et la même entrée dans le script d'index.html).
   La palette choisie sera persistée sous `cp.palette` (lecture en try/catch).
   ----------------------------------------------------------------------------- */
export const PALETTES = {
  // Couleur de fond (--c-bg) de chaque mode : sert à <meta name="theme-color">
  // (la barre du navigateur ne lit pas les variables CSS).
  // Recopiée dans styles.css (--c-bg), index.html et le manifeste : `npm run check:theme`.
  cocon: { light: "#FAF6EF", dark: "#170F18" },
} as const satisfies Record<string, { light: `#${string}`; dark: `#${string}` }>;
export type Palette = keyof typeof PALETTES;
export const DEFAULT_PALETTE: Palette = "cocon";
const PALETTE_KEY = "cp.palette";

export function readPalette(): Palette {
  try {
    const v = localStorage.getItem(PALETTE_KEY);
    if (v && Object.prototype.hasOwnProperty.call(PALETTES, v)) return v as Palette;
  } catch { /* stockage indisponible */ }
  return DEFAULT_PALETTE;
}

function apply(theme: Theme, palette: Palette = readPalette()) {
  const root = document.documentElement;
  root.setAttribute("data-palette", palette);
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  syncThemeColor(theme, palette);
}

/**
 * <meta name="theme-color"> suit le thème CHOISI : en clair/sombre forcé, une
 * seule couleur effective ; en « système », les deux metas avec leur media.
 * (Même logique dans le script en ligne d'index.html, avant le premier rendu.)
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

/** Thème clair/sombre : persiste le choix, se replie sur le réglage système. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => { apply(theme); }, [theme]);

  const cycle = () => {
    setTheme((t) => {
      const next: Theme = t === "light" ? "dark" : t === "dark" ? "system" : "light";
      try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
      return next;
    });
  };

  return [theme, cycle];
}
