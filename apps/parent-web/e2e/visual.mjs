#!/usr/bin/env node
/* =============================================================================
   LOT 10 — Captures visuelles RÉELLES de la console (hors CI) :
       npm run e2e:visual            (captures dans $SHOTS_DIR, défaut : <tmp>/cocon-shots)

   1. Construit l'appli (vite build) avec une URL Supabase FACTICE, dans un
      dossier temporaire (jamais dans le dépôt), puis la sert avec `vite preview`.
   2. Ouvre Chromium (playwright-core, navigateur préinstallé) et INTERCEPTE tout
      le réseau : Auth, PostgREST, RPC, Edge Functions et Realtime Supabase sont
      servis par les fixtures (e2e/fixtures.mjs) ; tuiles OSM remplacées par une
      image neutre ; toute autre requête externe est bloquée.
      → aucun mode démo dans le code de production.
   3. Capture la connexion + les 13 vues en 1440×900 et 390×844 (iPhone), en
      clair et en sombre, plus le tiroir mobile ouvert et le ticket d'appairage.

   Navigateur : PW_CHROMIUM (chemin d'exécutable) sinon /opt/pw-browsers/chromium
   s'il existe, sinon celui de playwright-core.
   ============================================================================= */
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { build, preview } from "vite";
import { chromium } from "playwright-core";
import { TABLES, RPC, USER } from "./fixtures.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_URL = "https://demo-cocon.supabase.co";
const STORAGE_KEY = "sb-demo-cocon-auth-token";
const OUT = process.env.SHOTS_DIR || join(tmpdir(), "cocon-shots");
const VIEWS = [
  "overview", "screen", "apps", "calls", "rules", "filter", "location",
  "security", "wellbeing", "requests", "messages", "family", "privacy",
];
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  iphone: {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
};
const THEMES = ["light", "dark"];
// Tuile de carte unie (beige) générée localement : aucun appel à OpenStreetMap.
const TILE = solidPng(0xEE, 0xE8, 0xDC);

/** PNG 1×1 d'une couleur unie (encodeur minimal, sans dépendance). */
function solidPng(r, g, b) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = 0xFFFFFFFF; for (const x of buf) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from([0, r, g, b]))), chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const outDir = mkdtempSync(join(tmpdir(), "cocon-build-"));

process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = "cle-publique-factice";
console.log("→ build (dossier temporaire)…");
await build({ root, logLevel: "warn", build: { outDir, emptyOutDir: true } });
const server = await preview({ root, logLevel: "warn", build: { outDir }, preview: { port: 4179, strictPort: false, open: false } });
const base = server.resolvedUrls.local[0];
console.log(`→ preview : ${base}`);

const executablePath = process.env.PW_CHROMIUM
  || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath });

function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, role: "authenticated", exp, email: USER.email })}.signature`;
  return { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "refresh-factice", user: USER };
}

/** Applique les filtres PostgREST simples (eq., gte., lte., in.) aux fixtures. */
function filterRows(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    const [op, ...rest] = v.split(".");
    const val = rest.join(".");
    if (op === "eq") out = out.filter((r) => r[k] === undefined || String(r[k]) === val);
    else if (op === "gte") out = out.filter((r) => r[k] === undefined || String(r[k]) >= val);
    else if (op === "lte") out = out.filter((r) => r[k] === undefined || String(r[k]) <= val);
    else if (op === "in") {
      const set = new Set(val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")));
      out = out.filter((r) => r[k] === undefined || set.has(String(r[k])));
    }
  }
  return out;
}

async function mockNetwork(context) {
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === new URL(base).origin) return route.continue();
    if (/tile\.openstreetmap\.org$/.test(url.hostname)) {
      return route.fulfill({ status: 200, contentType: "image/png", body: TILE });
    }
    if (url.origin !== SUPABASE_URL) return route.abort();
    const json = (body, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(body),
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" },
    });
    if (req.method() === "OPTIONS") return json({}, 200);
    const path = url.pathname;
    if (path.startsWith("/auth/v1/user")) return json(USER);
    if (path.startsWith("/auth/v1/token")) return json(session());
    if (path.startsWith("/auth/v1/logout")) return json({}, 204);
    if (path.startsWith("/functions/v1/")) return json({ ok: true });
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.split("/").pop();
      return json(RPC[fn] ? RPC[fn]() : null);
    }
    if (path.startsWith("/rest/v1/")) {
      if (req.method() !== "GET" && req.method() !== "HEAD") return json([], 201);
      const table = path.slice("/rest/v1/".length);
      const rows = filterRows(TABLES[table] ?? [], url.searchParams);
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(rows[0]) : json({ code: "PGRST116", message: "0 rows" }, 406);
      return json(rows);
    }
    return json({});
  });
  // Realtime : socket accepté localement, jamais relayé (aucun serveur réel).
  await context.routeWebSocket(/\/realtime\/v1\//, () => {});
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(() => !document.querySelector(".skeleton") && document.fonts.status === "loaded", null, { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
}

const shots = [];
async function shot(page, name) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  shots.push(file);
  console.log(`  ✓ ${name}`);
}

/** Contrôle : aucun défilement horizontal de la page. */
async function checkOverflow(page, name) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 0) console.warn(`  ⚠ ${name} : défilement horizontal de ${over}px`);
}

try {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      // --- Connexion (sans session) ---------------------------------------
      {
        const context = await browser.newContext({ ...vp, locale: "fr-FR", colorScheme: theme, reducedMotion: "reduce" });
        await mockNetwork(context);
        await context.addInitScript((th) => { try { localStorage.setItem("cp-theme", th); } catch { /* */ } }, theme);
        const page = await context.newPage();
        await page.goto(base);
        await settle(page);
        await checkOverflow(page, `login-${vpName}-${theme}`);
        await shot(page, `login-${vpName}-${theme}`);
        await context.close();
      }
      // --- Console (session simulée) --------------------------------------
      for (const view of VIEWS) {
        const context = await browser.newContext({ ...vp, locale: "fr-FR", colorScheme: theme, reducedMotion: "reduce" });
        await mockNetwork(context);
        await context.addInitScript(([key, sess, th, v]) => {
          try {
            localStorage.setItem(key, JSON.stringify(sess));
            localStorage.setItem("cp-theme", th);
            localStorage.setItem("cp.view", v);
          } catch { /* */ }
        }, [STORAGE_KEY, session(), theme, view]);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.goto(base);
        await page.waitForSelector(".shell h1", { timeout: 20_000 });
        await settle(page);
        if (view === "family") {
          await page.getByRole("button", { name: /Générer un code d'appairage/ }).first().click();
          await page.waitForSelector(".ticket");
          await page.waitForTimeout(200);
        }
        await checkOverflow(page, `${view}-${vpName}-${theme}`);
        await shot(page, `${view}-${vpName}-${theme}`);
        if (vpName === "iphone" && view === "overview") {
          await page.getByRole("button", { name: "Ouvrir le menu" }).click();
          await page.waitForTimeout(300);
          await page.screenshot({ path: join(OUT, `drawer-iphone-${theme}.png`), animations: "disabled" });
          shots.push(join(OUT, `drawer-iphone-${theme}.png`));
          console.log(`  ✓ drawer-iphone-${theme}`);
        }
        if (errors.length) console.warn(`  ⚠ ${view}-${vpName}-${theme} : ${errors.join(" | ")}`);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
  rmSync(outDir, { recursive: true, force: true });
}

console.log(`\n${shots.length} captures dans ${OUT}`);
