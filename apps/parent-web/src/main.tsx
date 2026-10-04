import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { I18nProvider, initI18n } from "./i18n";
import "./styles.css";

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
});
