#!/usr/bin/env node
/* =============================================================================
   LOT 9 — Garde-fou i18n de la console parent (exécuté en CI : npm run check:i18n).

   Complète le typecheck (`satisfies Messages`, qui garantit déjà les CLÉS) par
   des contrôles que le typage ne voit pas :
     1. chaque catalogue a EXACTEMENT les clés de fr.ts (ni manque, ni surplus) ;
     2. mêmes paramètres `{nom}` et mêmes balises `<b>…</b>` que le français ;
     3. un pluriel reste un pluriel (avec au moins la forme `other`) ;
     4. chaque langue de SUPPORTED_LOCALES a son fichier, et inversement aucun
        catalogue orphelin n'est oublié (simple avertissement) ;
     5. plus aucun « fr-FR » / toLocale*String("fr…") codé en dur hors src/i18n.
   Sans dépendance : les .ts sont transpilés avec le compilateur TypeScript du projet.
   ============================================================================= */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = join(root, "src/i18n/locales");
const errors = [];
const warnings = [];

const PLURAL = new Set(["zero", "one", "two", "few", "many", "other"]);
const isPlural = (v) => v && typeof v === "object" && typeof v.other === "string"
  && Object.keys(v).every((k) => PLURAL.has(k));

async function loadCatalog(file) {
  const src = readFileSync(file, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  if (/^\s*import\s/m.test(out)) {
    throw new Error(`${relative(root, file)} : un catalogue doit être autonome (aucun import).`);
  }
  const dir = mkdtempSync(join(tmpdir(), "i18n-"));
  const tmp = join(dir, "catalog.mjs");
  writeFileSync(tmp, out);
  try {
    return (await import(pathToFileURL(tmp).href)).default;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Aplatit le catalogue : chemin → string | pluriel. */
function flatten(obj, prefix = "", acc = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string" || isPlural(v)) acc.set(path, v);
    else if (v && typeof v === "object") flatten(v, path, acc);
    else acc.set(path, v);
  }
  return acc;
}

const texts = (v) => (typeof v === "string" ? [v] : Object.values(v ?? {}));
const params = (v) => new Set(texts(v).flatMap((s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1])));
const tags = (v) => new Set(texts(v).flatMap((s) => [...String(s).matchAll(/<(\w+)>/g)].map((m) => m[1])));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const fmtSet = (s) => `{${[...s].join(", ")}}`;

// --- 1-3. Comparaison des catalogues -----------------------------------------
const files = readdirSync(localesDir).filter((f) => /^[a-z]{2,3}(-[A-Za-z0-9]+)?\.ts$/.test(f));
const source = flatten(await loadCatalog(join(localesDir, "fr.ts")));

for (const f of files.filter((x) => x !== "fr.ts")) {
  const code = f.replace(/\.ts$/, "");
  const cat = flatten(await loadCatalog(join(localesDir, f)));
  for (const [key, ref] of source) {
    if (!cat.has(key)) { errors.push(`[${code}] clé manquante : ${key}`); continue; }
    const val = cat.get(key);
    // Langue sans pluriel (ja, zh…) : { other: "…" } suffit.
    if (isPlural(ref) && !isPlural(val)) errors.push(`[${code}] ${key} : pluriel attendu ({ other, … })`);
    if (!isPlural(ref) && typeof val !== "string") errors.push(`[${code}] ${key} : chaîne attendue`);
    const pRef = params(ref); const pVal = params(val);
    if (isPlural(ref)) { pRef.delete("count"); pVal.delete("count"); }
    if (!sameSet(pRef, pVal)) errors.push(`[${code}] ${key} : paramètres ${fmtSet(pVal)} ≠ ${fmtSet(pRef)}`);
    if (!sameSet(tags(ref), tags(val))) errors.push(`[${code}] ${key} : balises ${fmtSet(tags(val))} ≠ ${fmtSet(tags(ref))}`);
  }
  for (const key of cat.keys()) if (!source.has(key)) errors.push(`[${code}] clé inconnue (absente de fr) : ${key}`);
}

// --- 4. SUPPORTED_LOCALES ↔ fichiers -----------------------------------------
const config = readFileSync(join(root, "src/i18n/config.ts"), "utf8");
const m = config.match(/SUPPORTED_LOCALES\s*=\s*\[([^\]]*)\]/);
const supported = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
if (!supported.length) errors.push("SUPPORTED_LOCALES introuvable dans src/i18n/config.ts");
for (const code of supported) {
  if (!files.includes(`${code}.ts`)) errors.push(`Langue active « ${code} » sans catalogue src/i18n/locales/${code}.ts`);
}
for (const f of files) {
  const code = f.replace(/\.ts$/, "");
  if (!supported.includes(code)) warnings.push(`Catalogue ${f} présent mais non activé dans SUPPORTED_LOCALES`);
}

// --- 5. Locale codée en dur hors du module i18n --------------------------------
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
for (const file of walk(join(root, "src"))) {
  if (!/\.(ts|tsx)$/.test(file) || file.startsWith(join(root, "src/i18n"))) continue;
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (/["'`]fr-FR["'`]|toLocale(Date|Time)?String\(\s*["'`]/.test(line)) {
      errors.push(`${relative(root, file)}:${i + 1} : locale codée en dur (utiliser fmt.* de src/i18n)`);
    }
  });
}

warnings.forEach((w) => console.warn(`⚠ ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`✗ ${e}`));
  console.error(`\n${errors.length} problème(s) i18n.`);
  process.exit(1);
}
console.log(`✓ i18n : ${source.size} clés, langues actives : ${supported.join(", ")} (${files.length} catalogue(s)).`);
