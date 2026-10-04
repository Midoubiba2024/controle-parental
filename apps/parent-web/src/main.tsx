import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { I18nProvider, initI18n } from "./i18n";
import { clearChunkReloadFlag, RELOAD_FLAG } from "./lib/chunkReload";
import { initAppearance } from "./lib/theme";
import "./styles.css";

// Chunk introuvable (nouvelle version publiée) : on recharge UNE seule fois la
// page pour récupérer la nouvelle version ; sinon — ou hors ligne, où recharger
// ne servirait à rien — ViewErrorBoundary propose « Réessayer » / « Recharger ».
window.addEventListener("vite:preloadError", (event) => {
  if (!navigator.onLine) return;
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;          // déjà tenté : laisser l'erreur remonter
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch { return; }                                          // stockage indisponible : pas de boucle
  event.preventDefault();
  window.location.reload();
});

// Palette et mode (déjà posés par le script d'index.html) : theme-color et
// polices de l'identité choisie (chargées à la demande, hors Cocon).
initAppearance();

// La langue (et son catalogue, chargé paresseusement hors français) est résolue
// AVANT le premier rendu : pas de flash de texte dans une autre langue.
void initI18n().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </React.StrictMode>,
  );
  // Filet : sans vue paresseuse montée (ex. écran de connexion), on efface le
  // drapeau après 30 s pour qu'un futur chunk manquant puisse recharger à nouveau.
  window.setTimeout(clearChunkReloadFlag, 30_000);
});
