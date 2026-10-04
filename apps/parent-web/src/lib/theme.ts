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

// Couleurs de la barre du navigateur (Safari iOS), alignées sur --c-bg.
const THEME_COLOR = { light: "#FAF6EF", dark: "#170F18" } as const;

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  syncThemeColor(theme);
}

/**
 * <meta name="theme-color"> suit le thème CHOISI : en clair/sombre forcé, une
 * seule couleur effective ; en « système », les deux metas avec leur media.
 * (Même logique dans le script en ligne d'index.html, avant le premier rendu.)
 */
function syncThemeColor(theme: Theme) {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    const scheme = m.dataset.scheme as "light" | "dark" | undefined;
    if (!scheme) return;
    if (theme === "system") {
      m.media = `(prefers-color-scheme: ${scheme})`;
      m.content = THEME_COLOR[scheme];
    } else {
      m.media = "all";
      m.content = THEME_COLOR[theme];
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
