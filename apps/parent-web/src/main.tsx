import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { I18nProvider, initI18n } from "./i18n";
import "./styles.css";

// Après un redéploiement (GitHub Pages), les chunks de l'ancienne version ont
// disparu : un import paresseux échoue. On recharge UNE seule fois la page pour
// récupérer la nouvelle version (drapeau de session, effacé après un montage
// réussi) ; sinon ViewErrorBoundary propose « Réessayer » / « Recharger ».
const RELOAD_FLAG = "cp.chunkReload";
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;          // déjà tenté : laisser l'erreur remonter
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch { return; }                                          // stockage indisponible : pas de boucle
  event.preventDefault();
  window.location.reload();
});

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
  // Montage réussi : un futur chunk manquant pourra de nouveau déclencher un rechargement.
  window.setTimeout(() => { try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ } }, 5000);
});
