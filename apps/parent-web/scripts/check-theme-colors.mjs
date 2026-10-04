#!/usr/bin/env node
/* =============================================================================
   Cohérence des couleurs de fond par palette (barre du navigateur / PWA).
   La couleur de <meta name="theme-color"> ne peut pas lire les variables CSS :
   elle est donc recopiée à QUATRE endroits, qui doivent rester identiques :
     1. src/styles.css      : --c-bg de chaque palette (clair, sombre) ;
     2. src/lib/theme.ts    : PALETTES[palette] = { light, dark } ;
     3. index.html          : script anti-flash (palettes = { p: [clair, sombre] })
                              + les deux <meta name="theme-color"> par défaut ;
     4. public/manifest.webmanifest : theme_color / background_color (clair, défaut).
   Usage : npm run check:theme (échoue avec la liste des écarts).
   ============================================================================= */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const norm = (c) => c.trim().toUpperCase();
const errors = [];

// 2. theme.ts
const themeTs = read("src/lib/theme.ts");
const block = themeTs.match(/export const PALETTES = \{([\s\S]*?)\n\}/);
if (!block) throw new Error("PALETTES introuvable dans src/lib/theme.ts");
const palettes = {};
for (const m of block[1].matchAll(/(\w+):\s*\{\s*light:\s*"(#[0-9a-fA-F]{6})",\s*dark:\s*"(#[0-9a-fA-F]{6})"\s*\}/g)) {
  palettes[m[1]] = { light: norm(m[2]), dark: norm(m[3]) };
}
const DEFAULT = (themeTs.match(/DEFAULT_PALETTE: Palette = "(\w+)"/) ?? [])[1];
if (!DEFAULT || !palettes[DEFAULT]) errors.push(`theme.ts : palette par défaut inconnue (${DEFAULT})`);

// 1. styles.css : premier --c-bg de chaque bloc [data-palette="p"] (clair) et [data-theme="dark"] (sombre).
const css = read("src/styles.css");
for (const [p, want] of Object.entries(palettes)) {
  const light = css.match(new RegExp(`:root\\[data-palette="${p}"\\][^{]*\\{[^}]*?--c-bg:\\s*(#[0-9a-fA-F]{6})`));
  const dark = css.match(new RegExp(`:root\\[data-palette="${p}"\\]\\[data-theme="dark"\\][^{]*\\{[^}]*?--c-bg:\\s*(#[0-9a-fA-F]{6})`));
  const mq = css.match(new RegExp(`prefers-color-scheme: dark\\)\\s*\\{\\s*:root\\[data-palette="${p}"\\][^{]*\\{[^}]*?--c-bg:\\s*(#[0-9a-fA-F]{6})`));
  if (!light || norm(light[1]) !== want.light) errors.push(`styles.css ${p} clair : ${light?.[1]} ≠ ${want.light}`);
  if (!dark || norm(dark[1]) !== want.dark) errors.push(`styles.css ${p} sombre : ${dark?.[1]} ≠ ${want.dark}`);
  if (!mq || norm(mq[1]) !== want.dark) errors.push(`styles.css ${p} sombre (système) : ${mq?.[1]} ≠ ${want.dark}`);
}

// 3. index.html
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
for (const [scheme, key] of [["light", "light"], ["dark", "dark"]]) {
  const meta = html.match(new RegExp(`<meta name="theme-color" data-scheme="${scheme}" content="(#[0-9a-fA-F]{6})"`));
  if (DEFAULT && (!meta || norm(meta[1]) !== palettes[DEFAULT][key])) errors.push(`index.html meta ${scheme} : ${meta?.[1]} ≠ ${palettes[DEFAULT]?.[key]}`);
}

// 4. manifest
const manifest = JSON.parse(read("public/manifest.webmanifest"));
for (const k of ["theme_color", "background_color"]) {
  if (DEFAULT && norm(manifest[k] ?? "") !== palettes[DEFAULT].light) errors.push(`manifest ${k} : ${manifest[k]} ≠ ${palettes[DEFAULT].light}`);
}

if (errors.length) {
  console.error("Couleurs de thème incohérentes :\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(`Couleurs de thème cohérentes (${Object.keys(palettes).length} palette(s)).`);
