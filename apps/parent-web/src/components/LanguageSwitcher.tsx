import { fmt, SUPPORTED_LOCALES, useI18n, type Locale } from "../i18n";

/**
 * Sélecteur de langue (page Réglages, LOT 11). MASQUÉ tant qu'une seule
 * langue est active : il apparaît dès qu'une 2ᵉ langue est ajoutée à
 * SUPPORTED_LOCALES (src/i18n/config.ts). Chaque langue est affichée dans sa
 * propre langue (« français », « العربية »), via Intl.DisplayNames.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  if (SUPPORTED_LOCALES.length < 2) return null;
  return (
    <label className="lang-switch">
      <span>{t("common.language")}</span>
      <select value={locale} onChange={(e) => void setLocale(e.target.value as Locale)}>
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>{fmt.languageName(code)}</option>
        ))}
      </select>
    </label>
  );
}
