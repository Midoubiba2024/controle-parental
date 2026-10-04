#!/usr/bin/env node
/* =============================================================================
   LOT 10/11 — Captures visuelles RÉELLES de la console (hors CI) :
       npm run e2e:visual            (captures dans $SHOTS_DIR, défaut : <tmp>/cocon-shots)

   Paramètres (variables d'environnement, listes séparées par des virgules) :
     E2E_PALETTES  : identités à capturer (défaut : cocon,clarte,jardin) ;
     E2E_VIEWS     : vues (défaut : toutes, + settings) ;
     E2E_VIEWPORTS : desktop, iphone, iphone-se, iphone-landscape (défaut : tous) ;
     E2E_THEMES    : light, dark (défaut : les deux).
   Captures rangées par palette : $SHOTS_DIR/<palette>/<vue>-<écran>-<mode>.png.

   1. Construit l'appli (vite build) avec une URL Supabase FACTICE, dans un
      dossier temporaire (jamais dans le dépôt), puis la sert avec `vite preview`.
   2. Ouvre Chromium (playwright-core, navigateur préinstallé) et INTERCEPTE tout
      le réseau : Auth, PostgREST, RPC, Edge Functions et Realtime Supabase sont
      servis par les fixtures (e2e/fixtures.mjs) ; tuiles OSM remplacées par une
      image neutre ; toute autre requête externe est bloquée.
      → aucun mode démo dans le code de production.
   3. Capture la connexion + les vues en 1440×900 et 390×844 (iPhone), en
      clair et en sombre, plus le tiroir mobile ouvert et le ticket d'appairage,
      pour chaque palette.
   4. Contrôles fonctionnels (LOT 11) : Réglages au clavier (flèches), raccourci
      d'en-tête synchronisé, valeur du COMPTE prioritaire à la connexion, valeur
      inconnue → cocon, et AUCUNE police Clarté/Jardin téléchargée en Cocon.

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
const ALL_VIEWS = [
  "overview", "screen", "apps", "calls", "rules", "filter", "location",
  "security", "wellbeing", "requests", "messages", "family", "privacy", "settings",
];
const list = (name, all) => (process.env[name] ? process.env[name].split(",").map((x) => x.trim()).filter(Boolean) : all);
const VIEWS = list("E2E_VIEWS", ALL_VIEWS);
const PALETTES = list("E2E_PALETTES", ["cocon", "clarte", "jardin"]);
// Polices des identités chargées à la demande (jamais en Cocon).
const LAZY_FONTS = /(sora|manrope|outfit|nunito-sans)-latin/;
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
// Langue et fuseau FRANÇAIS : champs date/heure, dates relatives comme chez l'utilisateur.
const CONTEXT = { locale: "fr-FR", timezoneId: "Europe/Paris", reducedMotion: "reduce" };
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA },
  // iPhone SE : plus petit écran courant (contrôle anti-débordement à 375 px).
  "iphone-se": { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA },
  // iPhone en paysage : tiroir de navigation (pointeur tactile, hauteur ≤ 500 px).
  "iphone-landscape": { viewport: { width: 932, height: 430 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA },
};
const THEMES = list("E2E_THEMES", ["light", "dark"]);
const VIEWPORT_NAMES = list("E2E_VIEWPORTS", Object.keys(VIEWPORTS));
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
// --lang : champs date/heure natifs en français (jj/mm/aaaa, 24 h).
const browser = await chromium.launch({ executablePath, args: ["--lang=fr-FR"] });

/** Session simulée ; `user` : autre compte FICTIF (appareil partagé). */
function session(user = USER) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, role: "authenticated", exp, email: user.email })}.signature`;
  return { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "refresh-factice", user };
}
// 2ᵉ compte fictif (scénario « appareil partagé »).
const USER_B = { ...USER, id: "5c0b7a1e-2f4d-4e8a-9b3c-0d1e2f3a4b5c", email: "parent2@exemple.fr" };
/** Utilisateur d'une requête, d'après le jeton (champ `sub`). */
function requestUser(req) {
  try {
    const token = (req.headers()["authorization"] || "").replace(/^Bearer /, "");
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
  } catch { return USER.id; }
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

/** `account` : métadonnées du compte simulé (lues par GET, fusionnées par PUT /auth/v1/user). */
async function mockNetwork(context, account = { metadata: {} }) {
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
    if (path.startsWith("/auth/v1/user")) {
      // `account.byUser` : un compte simulé PAR utilisateur (appareil partagé).
      const sub = requestUser(req);
      const acc = account.byUser ? (account.byUser[sub] ??= { metadata: {} }) : account;
      const who = sub === USER_B.id ? USER_B : USER;
      if (req.method() === "PUT") {
        if (acc.failPut) return json({ code: 503, msg: "indisponible" }, 503);
        const body = JSON.parse(req.postData() || "{}");
        acc.metadata = { ...acc.metadata, ...(body.data ?? {}) };
        acc.puts = (acc.puts ?? 0) + 1;
      }
      return json({ ...who, user_metadata: acc.metadata });
    }
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
      // Comptage (select … { count: "exact", head: true }) : total dans Content-Range.
      const range = `${rows.length ? `0-${rows.length - 1}` : "*"}/${rows.length}`;
      if (req.method() === "HEAD") {
        return route.fulfill({ status: 200, headers: { "content-range": range, "access-control-allow-origin": "*", "access-control-expose-headers": "Content-Range" }, body: "" });
      }
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
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  shots.push(file);
  console.log(`  ✓ ${name}`);
}

/**
 * Contrôle T3 : l'habillage de Leaflet (jetons de la palette) l'emporte bien sur leaflet.css
 * (chargé après, plus .leaflet-touch). En sombre, l'attribution doit prendre
 * --c-ink-2 sur --c-surface — pas le blanc/noir de Leaflet.
 */
const failures = [];
async function checkLeafletTheme(page, name) {
  const r = await page.evaluate(() => {
    const el = document.querySelector(".map-frame .leaflet-control-attribution");
    if (!el) return null;
    // Couleur attendue : résolue par le navigateur via un élément témoin.
    const probe = document.createElement("span");
    probe.style.color = "var(--c-ink-2)";
    probe.style.backgroundColor = "var(--c-surface)";
    document.body.appendChild(probe);
    const want = getComputedStyle(probe);
    const got = getComputedStyle(el);
    const out = { color: got.color, bg: got.backgroundColor, wantColor: want.color, wantBg: want.backgroundColor };
    probe.remove();
    return out;
  });
  if (!r) { failures.push(`${name} : attribution Leaflet introuvable`); return; }
  if (r.color !== r.wantColor || r.bg !== r.wantBg) {
    failures.push(`${name} : attribution ${r.color} sur ${r.bg} (attendu ${r.wantColor} sur ${r.wantBg})`);
  } else console.log(`  ✓ ${name} : attribution Leaflet aux couleurs de la palette`);
}

/** Contrôle : aucun défilement horizontal de la page. */
async function checkOverflow(page, name) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 0) console.warn(`  ⚠ ${name} : défilement horizontal de ${over}px`);
}

/**
 * Contexte de console connecté, palette + mode posés en localStorage (une seule
 * fois par CONTEXTE : rechargements et 2ᵉ onglet gardent l'état). `extra` :
 * clés localStorage supplémentaires (propriétaire, préférence de l'appareil…).
 */
async function openConsole(vp, theme, palette, view, account, extra = {}) {
  const context = await browser.newContext({ ...vp, ...CONTEXT, colorScheme: theme === "system" ? "light" : theme });
  await mockNetwork(context, account);
  await context.addInitScript(([key, sess, th, v, pal, more]) => {
    try {
      if (localStorage.getItem("e2e-init")) return;
      localStorage.setItem("e2e-init", "1");
      localStorage.setItem(key, JSON.stringify(sess));
      localStorage.setItem("cp.theme", th);
      localStorage.setItem("cp.view", v);
      if (pal) localStorage.setItem("cp.palette", pal);
      for (const [k, val] of Object.entries(more)) localStorage.setItem(k, val);
    } catch { /* */ }
  }, [STORAGE_KEY, session(), theme, view, palette, extra]);
  const { page, fonts, errors } = await openPage(context);
  return { context, page, fonts, errors };
}

/** Nouvel onglet de console dans un contexte existant (erreurs captées DÈS le chargement). */
async function openPage(context) {
  const page = await context.newPage();
  const fonts = [];
  const errors = [];
  page.on("request", (r) => { if (r.url().endsWith(".woff2")) fonts.push(r.url()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector(".shell h1", { timeout: 20_000 });
  await settle(page);
  return { page, fonts, errors };
}

const rootAttr = (page, a) => page.evaluate((x) => document.documentElement.getAttribute(x), a);
function expect(ok, label) {
  if (ok) console.log(`  ✓ ${label}`);
  else failures.push(label);
}

try {
  // --- Contrôles fonctionnels (LOT 11) ------------------------------------------
  {
    console.log("→ contrôles Réglages / synchronisation / polices");
    const vp = VIEWPORTS.desktop;
    // a) Cocon : aucune police Clarté/Jardin hors Réglages.
    {
      const { context, page, fonts } = await openConsole(vp, "light", "cocon", "overview");
      expect(!fonts.some((f) => LAZY_FONTS.test(f)), "cocon : aucune police Clarté/Jardin téléchargée (vue d'ensemble)");
      expect(await rootAttr(page, "data-palette") === "cocon", "cocon : data-palette=cocon");
      await context.close();
    }
    // b) Réglages au clavier + raccourci d'en-tête synchronisé + envoi au compte.
    {
      const account = { metadata: {} };
      const { context, page, fonts } = await openConsole(vp, "light", "cocon", "settings", account);
      await page.locator('input[name="palette"][value="cocon"]').focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(300);
      expect(await rootAttr(page, "data-palette") === "clarte", "Réglages : flèche droite → Clarté appliquée immédiatement");
      expect(await page.evaluate(() => localStorage.getItem("cp.palette")) === "clarte", "Réglages : cp.palette mémorisée");
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      expect(fonts.some((f) => /sora-latin/.test(f)), "Clarté : Sora chargée à la demande");
      await page.locator(".mode-option", { hasText: "Sombre" }).click();   // clic sur la carte
      expect(await rootAttr(page, "data-theme") === "dark", "Réglages : mode Sombre appliqué");
      await page.locator(".header-actions .icon-btn").first().click();       // sombre → système
      expect(await page.getByRole("radio", { name: /Automatique/ }).isChecked(), "en-tête : raccourci synchronisé avec Réglages (Automatique)");
      await page.waitForTimeout(1200);
      expect(account.metadata.palette === "clarte" && account.metadata.theme === "system", `compte : préférences envoyées (${JSON.stringify(account.metadata)})`);
      await context.close();
    }
    // c) Connexion : la valeur du compte prime sur la valeur locale.
    {
      const account = { metadata: { palette: "jardin", theme: "dark" } };
      const { context, page } = await openConsole(vp, "light", "cocon", "overview", account);
      await page.waitForTimeout(500);
      expect(await rootAttr(page, "data-palette") === "jardin", "connexion : palette du compte prioritaire (jardin)");
      expect(await rootAttr(page, "data-theme") === "dark", "connexion : mode du compte prioritaire (sombre)");
      expect(await page.evaluate(() => localStorage.getItem("cp.palette")) === "jardin", "connexion : valeur locale mise à jour");
      await context.close();
    }
    // d) Valeur inconnue (locale et compte) → cocon.
    {
      const account = { metadata: { palette: "fluo" } };
      const { context, page } = await openConsole(vp, "light", "fluo", "overview", account);
      expect(await rootAttr(page, "data-palette") === "cocon", "valeur inconnue → cocon");
      await context.close();
    }
    const local = (page, k) => page.evaluate((key) => localStorage.getItem(key), k);
    // e) Choix non envoyé (compte injoignable) : il survit au rechargement malgré
    //    l'ancienne valeur du compte, puis part au retour du réseau.
    {
      const account = { metadata: { palette: "jardin", theme: "light" }, failPut: true };
      const { context, page } = await openConsole(vp, "light", "jardin", "settings", account);
      await page.locator(".palette-option", { hasText: "Clarté" }).click();
      await page.waitForTimeout(1200);
      expect(!!(await local(page, `cp.appearance.pending.${USER.id}`)), "hors ligne : choix marqué « non synchronisé »");
      await page.reload();
      await page.waitForSelector(".shell h1");
      await settle(page);
      expect(await rootAttr(page, "data-palette") === "clarte", "rechargement : le choix non envoyé prime sur l'ancienne valeur du compte");
      account.failPut = false;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.waitForTimeout(800);
      expect(account.metadata.palette === "clarte", `retour du réseau : choix envoyé au compte (${account.metadata.palette})`);
      expect(!(await local(page, `cp.appearance.pending.${USER.id}`)), "retour du réseau : marqueur effacé");
      await context.close();
    }
    // f) Appareil partagé, à partir d'un état RÉEL : préférence locale d'une
    //    version précédente (migrée en préférence de l'appareil), compte B qui
    //    impose la sienne, puis session de B expirée, puis connexion de A.
    {
      const accounts = { byUser: { [USER.id]: { metadata: {} }, [USER_B.id]: { metadata: { palette: "jardin", theme: "dark" } } } };
      const context = await browser.newContext({ ...vp, ...CONTEXT, colorScheme: "light" });
      await mockNetwork(context, accounts);
      await context.addInitScript(([key, sess]) => {
        try {
          if (localStorage.getItem("e2e-init")) return;
          localStorage.setItem("e2e-init", "1");
          localStorage.setItem(key, JSON.stringify(sess));
          localStorage.setItem("cp.palette", "clarte");   // anciennes clés, sans propriétaire
          localStorage.setItem("cp-theme", "light");
        } catch { /* */ }
      }, [STORAGE_KEY, session(USER_B)]);
      const { page, errors } = await openPage(context);
      await page.waitForTimeout(800);
      const device = JSON.parse(await local(page, "cp.appearance.device") ?? "null");
      expect(device?.palette === "clarte" && device?.theme === "light", `migration : préférence existante → préférence de l'appareil (${JSON.stringify(device)})`);
      expect(await rootAttr(page, "data-palette") === "jardin" && await local(page, "cp.appearance.owner") === USER_B.id, "compte B : sa préférence s'applique (propriétaire B)");
      // Session de B expirée pendant que l'appli était fermée → écran de connexion à la préférence de l'appareil.
      await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
      await page.reload();
      await page.waitForSelector(".auth");
      await page.waitForTimeout(300);
      expect(await rootAttr(page, "data-palette") === "clarte" && await rootAttr(page, "data-theme") === "light", "session expirée : écran de connexion à la préférence de l'appareil");
      // B se reconnecte (préférence B), puis la session passe à A sans déconnexion propre.
      await page.evaluate(([key, sess]) => localStorage.setItem(key, JSON.stringify(sess)), [STORAGE_KEY, session(USER_B)]);
      await page.reload();
      await page.waitForSelector(".shell h1");
      await page.waitForTimeout(800);
      await page.evaluate(([key, sess]) => localStorage.setItem(key, JSON.stringify(sess)), [STORAGE_KEY, session(USER)]);
      await page.reload();
      await page.waitForSelector(".shell h1");
      await page.waitForTimeout(800);
      const a = accounts.byUser[USER.id];
      expect(await rootAttr(page, "data-palette") === "clarte", "appareil partagé : préférence de B remplacée par celle de l'appareil pour A");
      expect(a.metadata.palette !== "jardin", `appareil partagé : préférence de B jamais envoyée au compte A (${JSON.stringify(a.metadata)})`);
      // Choix puis déconnexion IMMÉDIATE : l'envoi part avant signOut.
      await page.locator(".header-actions .icon-btn").first().click();       // clair → sombre
      await page.getByRole("button", { name: "Déconnexion" }).click();
      await page.waitForSelector(".auth", { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(500);
      expect(a.metadata.theme === "dark", `déconnexion : choix envoyé avant signOut (${a.metadata.theme})`);
      expect(await rootAttr(page, "data-palette") === "clarte" && await rootAttr(page, "data-theme") === "light",
        "déconnexion : retour à la préférence de l'appareil");
      expect(errors.length === 0, `appareil partagé : aucune erreur de page (${errors.join(" | ")})`);
      await context.close();
    }
    // h) Stockage corrompu (JSON valide mais pas un objet) : aucun plantage.
    {
      const context = await browser.newContext({ ...vp, ...CONTEXT, colorScheme: "light" });
      await mockNetwork(context);
      await context.addInitScript(() => {
        try {
          localStorage.setItem("cp.appearance.owner", "compte-fictif");
          localStorage.setItem("cp.appearance.device", "null");
          localStorage.setItem("cp.appearance.pending.compte-fictif", "1");
          localStorage.setItem("cp.palette", "jardin");
        } catch { /* */ }
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(base);
      await page.waitForSelector(".auth", { timeout: 20_000 });
      await page.waitForTimeout(300);
      expect(errors.length === 0 && await rootAttr(page, "data-palette") === "cocon",
        `stockage corrompu : pas de plantage, retour au défaut (${errors.join(" | ") || await rootAttr(page, "data-palette")})`);
      await context.close();
    }
    // g) Deux onglets : un choix dans l'un s'applique à l'autre, sans 2ᵉ envoi.
    {
      const account = { metadata: {} };
      const { context, page } = await openConsole(vp, "light", "cocon", "settings", account);
      const { page: other } = await openPage(context);
      await page.waitForTimeout(1000);
      const before = account.puts ?? 0;
      await page.locator(".palette-option", { hasText: "Jardin" }).click();
      await page.waitForTimeout(1500);
      expect(await rootAttr(other, "data-palette") === "jardin", "2ᵉ onglet : palette suivie (événement storage)");
      expect((account.puts ?? 0) - before === 1, `2ᵉ onglet : un seul envoi au compte (${(account.puts ?? 0) - before})`);
      await context.close();
    }
  }

  for (const palette of PALETTES) {
  console.log(`→ palette ${palette}`);
  for (const vpName of VIEWPORT_NAMES) {
    const vp = VIEWPORTS[vpName];
    for (const theme of THEMES) {
      // --- Connexion (sans session) ---------------------------------------
      {
        const context = await browser.newContext({ ...vp, ...CONTEXT, colorScheme: theme });
        await mockNetwork(context);
        await context.addInitScript(([th, pal]) => {
          try { localStorage.setItem("cp.theme", th); localStorage.setItem("cp.palette", pal); } catch { /* */ }
        }, [theme, palette]);
        const page = await context.newPage();
        await page.goto(base);
        await settle(page);
        await checkOverflow(page, `login-${vpName}-${theme}`);
        await shot(page, `${palette}/login-${vpName}-${theme}`);
        await context.close();
      }
      // --- Console (session simulée) --------------------------------------
      for (const view of VIEWS) {
        const { context, page, errors } = await openConsole(vp, theme, palette, view);
        if (await rootAttr(page, "data-palette") !== palette) failures.push(`${palette}/${view} : data-palette inattendu`);
        if (view === "family") {
          await page.getByRole("button", { name: /Générer un code d.appairage/ }).first().click();
          await page.waitForSelector(".ticket");
          await page.waitForTimeout(200);
        }
        const name = `${palette}/${view}-${vpName}-${theme}`;
        await checkOverflow(page, name);
        if (theme === "dark" && view === "location") await checkLeafletTheme(page, name);
        await shot(page, name);
        // Contraste élevé (Windows) : la sélection doit rester visible.
        if (view === "settings" && vpName === "desktop") {
          await page.emulateMedia({ forcedColors: "active" });
          await page.waitForTimeout(200);
          await shot(page, `${name}-forced-colors`);
          await page.emulateMedia({ forcedColors: "none" });
        }
        if (vpName !== "desktop" && view === "overview") {
          await page.getByRole("button", { name: /^Ouvrir le menu/ }).click();
          await page.waitForTimeout(300);
          const file = join(OUT, `${palette}/drawer-${vpName}-${theme}.png`);
          await page.screenshot({ path: file, animations: "disabled" });
          shots.push(file);
          console.log(`  ✓ ${palette}/drawer-${vpName}-${theme}`);
        }
        if (errors.length) console.warn(`  ⚠ ${name} : ${errors.join(" | ")}`);
        await context.close();
      }
    }
  }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
  rmSync(outDir, { recursive: true, force: true });
}

console.log(`\n${shots.length} captures dans ${OUT}`);
if (failures.length) {
  console.error(`\n${failures.length} contrôle(s) en échec :\n  - ${failures.join("\n  - ")}`);
  process.exitCode = 1;
}
