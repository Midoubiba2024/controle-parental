#!/usr/bin/env node
/* =============================================================================
   Cohérence des identités visuelles (LOT 10 + LOT 11). Usage : npm run check:theme
   (échoue avec la liste des écarts).

   A. Couleur de fond par palette (barre du navigateur / PWA). <meta name="theme-color">
      ne lit pas les variables CSS : --c-bg est recopié à QUATRE endroits :
        1. src/themes/<p>.css : --c-bg du bloc clair et des deux blocs sombres ;
        2. src/lib/theme.ts   : PALETTES[p] = { light, dark } ;
        3. index.html         : script anti-flash (palettes = { p: [clair, sombre] })
                                + les deux <meta name="theme-color"> par défaut ;
        4. public/manifest.webmanifest : theme_color / background_color (défaut, clair).
   B. Jetons COMPLETS : chaque palette a 3 blocs (clair, sombre forcé, sombre
      système) ; mêmes NOMS de jetons que la palette par défaut dans chaque bloc ;
      blocs sombre forcé et sombre système IDENTIQUES ; tout jeton de couleur du
      bloc clair est redéfini en sombre (formes et polices exceptées).
   C. CONTRASTES WCAG 2.x, pour chaque palette en clair ET en sombre :
      ≥ 4,5:1 pour le texte, ≥ 3:1 pour bordures de contrôles, icônes, focus et
      gros titres. Les couleurs rgba() sont composées sur leur fond.
      (Séries de graphiques : validées à part en daltonisme — cf. commentaires
      des fichiers de palettes.)
   ============================================================================= */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const norm = (c) => c.trim().toUpperCase();
const errors = [];

// --- theme.ts --------------------------------------------------------------
const themeTs = read("src/lib/theme.ts");
const block = themeTs.match(/export const PALETTES = \{([\s\S]*?)\n\}/);
if (!block) throw new Error("PALETTES introuvable dans src/lib/theme.ts");
const palettes = {};
for (const m of block[1].matchAll(/(\w+):\s*\{\s*light:\s*"(#[0-9a-fA-F]{6})",\s*dark:\s*"(#[0-9a-fA-F]{6})"/g)) {
  palettes[m[1]] = { light: norm(m[2]), dark: norm(m[3]) };
}
const DEFAULT = (themeTs.match(/DEFAULT_PALETTE: Palette = "(\w+)"/) ?? [])[1];
if (!DEFAULT || !palettes[DEFAULT]) errors.push(`theme.ts : palette par défaut inconnue (${DEFAULT})`);

// --- Feuilles de palettes ----------------------------------------------------
const themeFiles = readdirSync(join(root, "src/themes")).filter((f) => f.endsWith(".css"));
for (const f of themeFiles) {
  const p = f.replace(/\.css$/, "");
  if (!palettes[p]) errors.push(`src/themes/${f} : palette absente de PALETTES (theme.ts)`);
}
const styles = read("src/styles.css");
const decls = (body) => new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\s+/g, " ").trim()]));
const NON_COLOR = /^--(font-|r-|fw-)|^--(focus-ring|shadow-selected)$/;

const blocks = {};
for (const p of Object.keys(palettes)) {
  const file = `src/themes/${p}.css`;
  let css;
  try { css = read(file); } catch { errors.push(`${file} introuvable`); continue; }
  if (!styles.includes(`@import "./themes/${p}.css";`)) errors.push(`styles.css : @import "./themes/${p}.css" manquant`);
  const light = css.match(new RegExp(`:root\\[data-palette="${p}"\\](?:,[^{]*)?\\s*\\{([^}]*)\\}`));
  const forced = css.match(new RegExp(`:root\\[data-palette="${p}"\\]\\[data-theme="dark"\\][^{]*\\{([^}]*)\\}`));
  const system = css.match(new RegExp(`prefers-color-scheme: dark\\)\\s*\\{\\s*:root\\[data-palette="${p}"\\]:not\\(\\[data-theme="light"\\]\\)[^{]*\\{([^}]*)\\}`));
  if (!light || !forced || !system) { errors.push(`${file} : bloc clair, sombre forcé ou sombre système introuvable`); continue; }
  const b = { light: decls(light[1]), dark: decls(forced[1]), system: decls(system[1]) };
  blocks[p] = b;

  // A.1 — fonds
  const want = palettes[p];
  if (norm(b.light.get("--c-bg") ?? "") !== want.light) errors.push(`${file} clair : --c-bg ${b.light.get("--c-bg")} ≠ ${want.light}`);
  if (norm(b.dark.get("--c-bg") ?? "") !== want.dark) errors.push(`${file} sombre : --c-bg ${b.dark.get("--c-bg")} ≠ ${want.dark}`);
  if (norm(b.system.get("--c-bg") ?? "") !== want.dark) errors.push(`${file} sombre (système) : --c-bg ${b.system.get("--c-bg")} ≠ ${want.dark}`);

  // B — sombre forcé = sombre système
  for (const [k, v] of b.dark) if (b.system.get(k) !== v) errors.push(`${file} sombre : ${k} = ${v} (forcé) ≠ ${b.system.get(k)} (système)`);
  for (const k of b.system.keys()) if (!b.dark.has(k)) errors.push(`${file} sombre : ${k} seulement dans le bloc système`);
  // B — toute couleur du clair est redéfinie en sombre
  for (const k of b.light.keys()) if (!NON_COLOR.test(k) && !b.dark.has(k)) errors.push(`${file} : ${k} non redéfini en sombre`);
}
// B — mêmes noms de jetons que la palette par défaut
const ref = blocks[DEFAULT];
if (ref) {
  for (const [p, b] of Object.entries(blocks)) {
    if (p === DEFAULT) continue;
    for (const part of ["light", "dark"]) {
      const a = new Set(ref[part].keys()), c = new Set(b[part].keys());
      for (const k of a) if (!c.has(k)) errors.push(`themes/${p}.css (${part}) : jeton ${k} manquant (présent dans ${DEFAULT})`);
      for (const k of c) if (!a.has(k)) errors.push(`themes/${p}.css (${part}) : jeton ${k} inconnu de ${DEFAULT}`);
    }
  }
}

// --- C. Contrastes -----------------------------------------------------------
function parse(c) {
  c = c.trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = c.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  return null;
}
const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

// [premier plan, fond, minimum, fond sous le fond (si rgba)]
const T = 4.5, G = 3;
const PAIRS = [
  ["--c-ink", "--c-bg", T], ["--c-ink", "--c-surface", T], ["--c-ink-2", "--c-surface", T],
  ["--c-muted", "--c-bg", T], ["--c-muted", "--c-surface", T], ["--c-muted", "--c-sunken", T],
  ["--c-accent-text", "--c-surface", T], ["--c-accent-text", "--c-bg", T], ["--c-accent-text", "--c-accent-soft", G],
  ["--c-accent-ink", "--c-accent", T], ["--c-accent-ink", "--c-accent-hover", T], ["--c-accent", "--c-surface", G],
  ["--c-plum", "--c-plum-soft", T], ["--c-plum", "--c-surface", G],
  ["--c-sand-ink", "--c-sand", T], ["--c-family-ink", "--c-sand", T], ["--c-sand-ink", "--c-ticket-bg", T],
  ["--c-sage-ink", "--c-sage-soft", T], ["--c-sage-title", "--c-sage-soft", T], ["--c-brick", "--c-sage-soft", T],
  ["--c-sage-ink", "--c-good-soft", T], ["--c-brick", "--c-surface", T],
  ["--c-ochre-ink", "--c-ochre-soft", T],
  ["--c-good", "--c-good-soft", T], ["--c-warning", "--c-warning-soft", T], ["--c-danger", "--c-danger-soft", T],
  ["--c-good", "--c-surface", T], ["--c-warning", "--c-surface", T], ["--c-danger", "--c-surface", T],
  ["--c-ticket-ink", "--c-ticket-bg", T],
  ["--c-avatar-ink", "--c-avatar-bg", T],
  ["--c-family-ic-ink", "--c-family-ic-bg", G], ["--c-transparency-ic-ink", "--c-transparency-ic-bg", G],
  ["--c-control", "--c-surface", G], ["--c-control", "--c-sunken", G], ["--c-control", "--c-bg", G],
  ["--c-focus", "--c-surface", G], ["--c-focus", "--c-bg", G],
  ["--chart-limit", "--c-surface", G],
  // Barre latérale (et tiroir mobile, et panneau de connexion qui la reprend)
  ["--c-side-ink", "--c-side", T], ["--c-side-strong", "--c-side", T], ["--c-side-title", "--c-side", T],
  ["--c-side-foot", "--c-side", T], ["--c-side-email", "--c-side", T], ["--c-side-control", "--c-side", G],
  ["--c-side-strong", "--c-side-hover", T, "--c-side"],
  ["--c-side-active-ink", "--c-side-active", T, "--c-side"],
  ["--c-side-active-icon", "--c-side-active", G, "--c-side"],
  ["--c-side-active-count-ink", "--c-side-active-count-bg", T],
  ["--c-brand-logo-ink", "--c-brand-logo-bg", G],
  ["--c-auth-point-ink", "--c-auth-point-bg", G, "--c-side"],
  ["--c-focus", "--c-side", G],
];
let checked = 0;
for (const [p, b] of Object.entries(blocks)) {
  for (const mode of ["light", "dark"]) {
    const tok = new Map([...b.light, ...(mode === "dark" ? b.dark : [])]);
    const resolve = (k, seen = 0) => { const v = tok.get(k); const m = v?.match(/^var\((--[\w-]+)\)$/); return m && seen < 5 ? resolve(m[1], seen + 1) : v; };
    for (const [fgK, bgK, min, baseK] of PAIRS) {
      const fg = parse(resolve(fgK) ?? ""), bg0 = parse(resolve(bgK) ?? ""), base = baseK ? parse(resolve(baseK) ?? "") : null;
      if (!fg || !bg0) { errors.push(`${p} ${mode} : ${fgK} / ${bgK} illisible`); continue; }
      const bg = bg0[3] < 1 && base ? over(bg0, base) : bg0;
      const r = ratio(fg[3] < 1 ? over(fg, bg) : fg, bg);
      checked++;
      if (r < min) errors.push(`${p} ${mode} : contraste ${fgK} sur ${bgK} = ${r.toFixed(2)}:1 < ${min}:1`);
    }
  }
}

// --- A.3 index.html ------------------------------------------------------------
const html = read("index.html");
const inline = html.match(/var palettes = \{([^}]*)\}/);
if (!inline) errors.push("index.html : objet palettes introuvable");
else {
  const found = {};
  for (const m of inline[1].matchAll(/(\w+):\s*\["(#[0-9a-fA-F]{6})",\s*"(#[0-9a-fA-F]{6})"\]/g)) found[m[1]] = [norm(m[2]), norm(m[3])];
  for (const [p, want] of Object.entries(palettes)) {
    const got = found[p];
    if (!got || got[0] !== want.light || got[1] !== want.dark) errors.push(`index.html palettes.${p} : ${got} ≠ ${want.light},${want.dark}`);
  }
  for (const p of Object.keys(found)) if (!palettes[p]) errors.push(`index.html : palette ${p} absente de theme.ts`);
}
for (const scheme of ["light", "dark"]) {
  const meta = html.match(new RegExp(`<meta name="theme-color" data-scheme="${scheme}" content="(#[0-9a-fA-F]{6})"`));
  if (DEFAULT && (!meta || norm(meta[1]) !== palettes[DEFAULT][scheme])) errors.push(`index.html meta ${scheme} : ${meta?.[1]} ≠ ${palettes[DEFAULT]?.[scheme]}`);
}

// --- A.4 manifest ----------------------------------------------------------------
const manifest = JSON.parse(read("public/manifest.webmanifest"));
for (const k of ["theme_color", "background_color"]) {
  if (DEFAULT && norm(manifest[k] ?? "") !== palettes[DEFAULT].light) errors.push(`manifest ${k} : ${manifest[k]} ≠ ${palettes[DEFAULT].light}`);
}

if (errors.length) {
  console.error("Identités visuelles incohérentes :\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(`Identités visuelles cohérentes : ${Object.keys(palettes).length} palette(s), ${checked} contrastes vérifiés.`);
