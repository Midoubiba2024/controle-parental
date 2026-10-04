/* Point d'entrée unique du module i18n (voir docs/13-I18N.md). */
export {
  DEFAULT_LOCALE, RTL_LOCALES, SUPPORTED_LOCALES, isRtl, type Locale,
} from "./config";
export { getLocale, initI18n, setLocale, t } from "./core";
export { fmt } from "./format";
export { errorMessage } from "./errors";
export { I18nProvider, Trans, useI18n } from "./I18nProvider";
export type { MessageKey, Messages, PluralForms } from "./types";

/**
 * Table de libellés « paresseuse » : chaque accès `MAP[clé]` relit la traduction
 * dans la langue ACTIVE (getter), ce qui permet de garder des constantes
 * exportées (`GEOFENCE_TYPE_LABEL[type]`…) sans figer la langue au chargement.
 */
export function labelMap<K extends string>(keys: readonly K[], label: (key: K) => string): Readonly<Record<K, string>> {
  const out = {} as Record<K, string>;
  for (const k of keys) Object.defineProperty(out, k, { get: () => label(k), enumerable: true });
  return out;
}
