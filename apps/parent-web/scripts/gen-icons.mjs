#!/usr/bin/env node
/* =============================================================================
   LOT 10 — Génère UNE FOIS les icônes PNG de la console (commitées dans public/) :
   apple-touch-icon 180×180 (écran d'accueil iPhone), icon-192/512 et
   icon-maskable-512 (manifest). Rendu par Chromium (playwright-core) à partir du
   logo SVG maison (bouclier + cœur). À relancer seulement si le logo change :
       node scripts/gen-icons.mjs
   ============================================================================= */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const executablePath = process.env.PW_CHROMIUM
  || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

// Fond plein (iOS arrondit lui-même les coins : jamais de transparence).
const full = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
<rect width="64" height="64" fill="#B5472F"/><g transform="translate(14 14) scale(1.5)" fill="none" stroke="#FFFDF9" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 15.5s-3.2-1.9-3.2-4.1a1.8 1.8 0 0 1 3.2-1.1 1.8 1.8 0 0 1 3.2 1.1c0 2.2-3.2 4.1-3.2 4.1z"/></g></svg>`;
const maskable = readFileSync(join(root, "scripts/icons/maskable.svg"), "utf8").replace("<svg ", '<svg width="512" height="512" ');

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
async function render(svg, size, name) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: join(pub, name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`✓ public/${name}`);
}
await render(full(180), 180, "apple-touch-icon.png");
await render(full(192), 192, "icon-192.png");
await render(full(512), 512, "icon-512.png");
await render(maskable, 512, "icon-maskable-512.png");
await browser.close();
