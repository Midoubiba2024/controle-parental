#!/usr/bin/env node
/* =============================================================================
   LOT 11 — Les polices des identités Clarté et Jardin sont chargées À LA DEMANDE.
   Après `npm run build`, vérifie qu'AUCUNE d'elles n'est référencée par le
   chargement initial : index.html et les fichiers qu'il charge directement
   (scripts, modulepreload, feuilles de style, preload de police).
   Usage : npm run check:fonts [dossier] (défaut : dist).
   ============================================================================= */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, process.argv[2] ?? "dist");
const LAZY = /(sora|manrope|outfit|nunito-sans)-latin[\w-]*\.woff2/gi;

const htmlPath = join(dist, "index.html");
if (!existsSync(htmlPath)) { console.error(`${htmlPath} introuvable : lancez d'abord npm run build.`); process.exit(1); }
const html = readFileSync(htmlPath, "utf8");
const initial = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1]);
const errors = [];
for (const m of html.matchAll(LAZY)) errors.push(`index.html → ${m[0]}`);
for (const file of initial) {
  if (!/\.(js|css)$/.test(file)) { if (LAZY.test(file)) errors.push(`index.html précharge ${file}`); LAZY.lastIndex = 0; continue; }
  const body = readFileSync(join(dist, file), "utf8");
  for (const m of body.matchAll(LAZY)) errors.push(`${file} → ${m[0]}`);
}
if (errors.length) {
  console.error("Polices Clarté/Jardin dans le chargement initial :\n  - " + [...new Set(errors)].join("\n  - "));
  process.exit(1);
}
console.log(`Polices à la demande : rien dans le chargement initial (${initial.length} fichier(s) vérifié(s)).`);
