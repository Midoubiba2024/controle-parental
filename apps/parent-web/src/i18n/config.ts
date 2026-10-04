/* =============================================================================
   LOT 9 — Configuration des langues de la console parent.

   👉 ACTIVER UNE LANGUE = (1) créer `locales/<code>.ts` (copie traduite de
   `locales/fr.ts`, terminée par `satisfies Messages`) puis (2) ajouter <code>
   ci-dessous dans SUPPORTED_LOCALES. Aucun autre fichier à modifier : le
   chargement (paresseux), le sens d'écriture, le sélecteur de langue et les
   formats (dates, nombres…) suivent automatiquement. Procédure complète :
   docs/13-I18N.md.
   ============================================================================= */

/** Langues ACTIVES, dans l'ordre d'affichage du sélecteur. Seule liste à éditer. */
export const SUPPORTED_LOCALES = ["fr"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Langue source (catalogue de référence) et langue de repli. */
export const DEFAULT_LOCALE: Locale = "fr";

/** Langues écrites de droite à gauche (comparaison sur la sous-étiquette de langue). */
export const RTL_LOCALES: readonly string[] = ["ar", "he", "fa", "ur"];

/** Clé localStorage de la préférence de langue. */
export const LOCALE_STORAGE_KEY = "cp.locale";

export function isSupportedLocale(code: string | null | undefined): code is Locale {
  return !!code && (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

/** Sous-étiquette de langue d'un tag BCP 47 : « fr-CA » → « fr ». */
export function baseLanguage(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0];
}

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.includes(baseLanguage(locale));
}

/**
 * Langue initiale : préférence enregistrée → langues du navigateur (tag exact
 * puis langue de base) → DEFAULT_LOCALE. Ne lève jamais (stockage indisponible
 * en navigation privée, etc.).
 */
export function resolveInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(saved)) return saved;
  } catch { /* stockage indisponible */ }
  const prefs = typeof navigator !== "undefined"
    ? (navigator.languages?.length ? navigator.languages : [navigator.language])
    : [];
  for (const tag of prefs) {
    if (!tag) continue;
    if (isSupportedLocale(tag)) return tag;
    const base = baseLanguage(tag);
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function saveLocalePreference(locale: Locale): void {
  try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* ignore */ }
}
