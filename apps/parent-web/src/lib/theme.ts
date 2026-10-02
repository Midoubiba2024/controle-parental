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

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
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
