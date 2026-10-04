import { useEffect } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SUPPORTED_LOCALES, useI18n } from "../../i18n";
import {
  DEFAULT_PALETTE, loadPaletteFonts, PALETTE_IDS, THEMES, useAppearance, type Theme,
} from "../../lib/theme";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { ic } from "../icons";

/* =============================================================================
   LOT 11 — Réglages de la console (préférences d'AFFICHAGE uniquement).
   - Apparence : identité visuelle (Cocon, Clarté, Jardin) et mode (clair,
     sombre, automatique). Deux groupes de VRAIS boutons radio (flèches du
     clavier, lecteurs d'écran) ; le choix s'applique immédiatement, est
     mémorisé localement et synchronisé avec le compte (lib/appearanceSync.ts).
   - Langue : sélecteur existant, affiché dès qu'une 2ᵉ langue est active.
   Les vignettes sont rendues avec les VRAIS jetons de chaque palette
   (.palette-scope[data-palette], cf. src/themes/*.css), dans le mode courant.
   ============================================================================= */

const MODE_ICONS: Record<Theme, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

export function SettingsView() {
  const { t } = useI18n();
  const { palette, theme, setPalette, setTheme } = useAppearance();

  // Vignettes : la police de TITRE de chaque identité (seule utilisée par « Aa »).
  useEffect(() => { PALETTE_IDS.forEach((p) => { void loadPaletteFonts(p); }); }, []);

  return (
    <div className="stack settings" style={{ gap: 20 }}>
      <section className="card" aria-labelledby="settings-appearance">
        <div className="card-head">
          <div>
            <h2 id="settings-appearance">{t("views.settings.appearance.title")}</h2>
            <p className="card-sub">{t("views.settings.appearance.sub")}</p>
          </div>
        </div>

        <fieldset className="settings-group">
          <legend>{t("views.settings.palette.legend")}</legend>
          <div className="palette-grid">
            {PALETTE_IDS.map((id) => {
              const checked = palette === id;
              return (
                <label key={id} className={`palette-option${checked ? " on" : ""}`}>
                  <input type="radio" name="palette" value={id} className="visually-hidden"
                    checked={checked} onChange={() => setPalette(id)}
                    aria-describedby={`palette-desc-${id}`} />
                  <PaletteThumb id={id} sample={t("views.settings.palette.sample")} />
                  <span className="palette-text">
                    <span className="palette-name">
                      {t(`views.settings.palettes.${id}.name`)}
                      {id === DEFAULT_PALETTE && <span className="badge">{t("views.settings.palette.default")}</span>}
                    </span>
                    <span className="palette-desc" id={`palette-desc-${id}`}>{t(`views.settings.palettes.${id}.desc`)}</span>
                  </span>
                  {checked && (
                    <span className="palette-check" aria-hidden="true" title={t("views.settings.palette.selected")}>
                      <Check {...ic} size={16} strokeWidth={2.5} />
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="settings-group">
          <legend>{t("views.settings.mode.legend")}</legend>
          <div className="mode-options">
            {THEMES.map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <label key={m} className={`mode-option${theme === m ? " on" : ""}`}>
                  <input type="radio" name="mode" value={m} className="visually-hidden"
                    checked={theme === m} onChange={() => setTheme(m)} />
                  <Icon {...ic} size={18} aria-hidden="true" />
                  <span>{t(`views.settings.mode.${m}`)}</span>
                </label>
              );
            })}
          </div>
          <p className="settings-hint">
            {theme === "system" && <>{t("views.settings.mode.systemHint")} </>}
            {t("views.settings.mode.shortcut")}
          </p>
        </fieldset>
      </section>

      {SUPPORTED_LOCALES.length > 1 && (
        <section className="card" aria-labelledby="settings-language">
          <h2 id="settings-language">{t("views.settings.language.title")}</h2>
          <p className="card-sub" style={{ marginBottom: 14 }}>{t("views.settings.language.sub")}</p>
          <LanguageSwitcher />
        </section>
      )}

      <p className="note settings-note">{t("views.settings.note")}</p>
    </div>
  );
}

/** Mini-console décorative aux couleurs RÉELLES de la palette (mode courant). */
function PaletteThumb({ id, sample }: { id: string; sample: string }) {
  return (
    <span className="palette-thumb palette-scope" data-palette={id} aria-hidden="true">
      <span className="pt-side">
        <span className="pt-logo" />
        <span className="pt-nav on" />
        <span className="pt-nav" />
        <span className="pt-nav" />
      </span>
      <span className="pt-main">
        <span className="pt-aa">{sample}</span>
        <span className="pt-card">
          <span className="pt-line" />
          <span className="pt-line short" />
          <span className="pt-btn" />
        </span>
      </span>
    </span>
  );
}
