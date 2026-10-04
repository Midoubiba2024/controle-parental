import fr from "./locales/fr";
import {
  DEFAULT_LOCALE, isRtl, isSupportedLocale, resolveInitialLocale, saveLocalePreference,
  type Locale,
} from "./config";
import type { MessageKey, Messages, ParamArgs, ParamValue, PluralForms } from "./types";

/* =============================================================================
   Moteur i18n maison (sans dépendance) : état de langue module-level, lisible
   HORS React (lib/*) comme dans React (via I18nProvider/useI18n, qui s'abonne
   aux changements). Le français est embarqué (source + repli) ; les autres
   catalogues sont chargés paresseusement (un chunk par langue).
   ============================================================================= */

// Un fichier par langue dans ./locales ; Vite en fait des chunks séparés. Le
// français (source/repli) est importé statiquement, donc exclu du chargement paresseux.
const LOADERS = import.meta.glob<{ default: Messages }>(["./locales/*.ts", "!./locales/fr.ts"]);

const catalogs = new Map<string, Messages>([["fr", fr as Messages]]);

let currentLocale: Locale = DEFAULT_LOCALE;
let currentMessages: Messages = fr as Messages;
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function loadCatalog(locale: Locale): Promise<Messages> {
  const cached = catalogs.get(locale);
  if (cached) return cached;
  const loader = LOADERS[`./locales/${locale}.ts`];
  if (!loader) throw new Error(`Catalogue introuvable pour « ${locale} »`);
  const mod = await loader();
  catalogs.set(locale, mod.default);
  return mod.default;
}

function applyDocument(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = currentLocale;
  root.dir = isRtl(currentLocale) ? "rtl" : "ltr";
  document.title = t("app.documentTitle");
}

/** Change de langue (charge le catalogue si besoin) et notifie les abonnés. */
export async function setLocale(locale: Locale, opts: { persist?: boolean } = {}): Promise<void> {
  if (!isSupportedLocale(locale)) return;
  let messages: Messages;
  try {
    messages = await loadCatalog(locale);
  } catch (e) {
    console.error(e);
    return;   // on reste sur la langue courante plutôt que d'afficher des clés
  }
  currentLocale = locale;
  currentMessages = messages;
  pluralCache.clear();
  if (opts.persist !== false) saveLocalePreference(locale);
  applyDocument();
  listeners.forEach((fn) => fn());
}

/** À appeler une fois avant le premier rendu. */
export async function initI18n(): Promise<void> {
  const locale = resolveInitialLocale();
  if (locale === DEFAULT_LOCALE) applyDocument();
  else await setLocale(locale, { persist: false });
}

/* ------------------------------ Traduction ------------------------------ */

const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);

const pluralCache = new Map<string, Intl.PluralRules>();
function pluralRules(locale: string): Intl.PluralRules {
  let pr = pluralCache.get(locale);
  if (!pr) { pr = new Intl.PluralRules(locale); pluralCache.set(locale, pr); }
  return pr;
}

function lookup(messages: Messages, key: string): string | PluralForms | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && typeof (node as PluralForms).other === "string"
    && Object.keys(node).every((k) => PLURAL_CATEGORIES.has(k))) {
    return node as PluralForms;
  }
  return undefined;
}

/** Remplace `{nom}` par la valeur fournie ; un paramètre absent reste visible. */
export function interpolate(template: string, params?: Record<string, ParamValue>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    params[name] !== undefined ? String(params[name]) : m);
}

/** Texte brut (non interpolé) d'une clé, pluriel résolu. Exporté pour <Trans>. */
export function resolveTemplate(key: string, params?: Record<string, unknown>): string {
  const value = lookup(currentMessages, key) ?? lookup(fr as Messages, key);
  if (value === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] clé manquante : ${key}`);
    return key;
  }
  if (typeof value === "string") return value;
  const count = Number(params?.count ?? 0);
  const cat = pluralRules(currentLocale).select(count) as keyof PluralForms;
  return value[cat] ?? value.other;
}

/**
 * Traduit une clé typée. `t("nav.overview")`, `t("x.y", { name: "Léa" })`,
 * pluriels : `t("x.apps", { count: 3 })` (forme choisie par Intl.PluralRules).
 */
export function t<K extends MessageKey>(key: K, ...args: ParamArgs<K>): string {
  const params = args[0] as Record<string, ParamValue> | undefined;
  return interpolate(resolveTemplate(key, params), params);
}
