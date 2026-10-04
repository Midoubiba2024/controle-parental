import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../i18n";

/**
 * Filet de sécurité : une exception de rendu dans la console (donnée inattendue…)
 * affiche un message traduit + « Recharger » au lieu d'un écran blanc complet.
 * Le détail technique part en console uniquement (jamais affiché).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[rendu interrompu]", error, info.componentStack);
  }

  render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}

function CrashScreen() {
  const { t } = useI18n();
  return (
    <div className="center">
      <div className="card" style={{ width: 360 }}>
        <p className="msg error">{t("common.unexpectedError")}</p>
        <button onClick={() => window.location.reload()}>{t("common.reload")}</button>
      </div>
    </div>
  );
}
