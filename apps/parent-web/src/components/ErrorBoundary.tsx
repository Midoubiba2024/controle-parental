import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { useI18n } from "../i18n";
import { ic } from "./icons";

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
      <div className="card" style={{ width: "min(400px, 100%)" }}>
        <p className="msg error" style={{ marginBottom: 16 }}>{t("common.unexpectedError")}</p>
        <button onClick={() => window.location.reload()}>{t("common.reload")}</button>
      </div>
    </div>
  );
}

/**
 * Filet LOCAL autour d'une vue chargée à la demande : un chunk introuvable (ex.
 * nouvelle version publiée sur GitHub Pages) ou une erreur de rendu n'emportent
 * ni la barre latérale ni l'en-tête. Monté avec `key={vue}` : changer de vue
 * réinitialise l'erreur et relance le chargement.
 */
export class ViewErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[vue interrompue]", error, info.componentStack);
  }

  retry = () => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));

  render() {
    if (this.state.failed) return <ViewFailed onRetry={this.retry} />;
    // `key` : un nouvel essai remonte entièrement le sous-arbre (nouvel import).
    return <div key={this.state.attempt} style={{ display: "contents" }}>{this.props.children}</div>;
  }
}

function ViewFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card" role="alert">
      <div className="empty">
        <span className="empty-ic"><TriangleAlert {...ic} size={22} /></span>
        <p className="empty-title">{t("dashboard.viewError")}</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
          <button type="button" onClick={onRetry}><RotateCcw {...ic} size={18} />{t("common.retry")}</button>
          <button type="button" className="ghost" onClick={() => window.location.reload()}>
            <RefreshCw {...ic} size={18} />{t("common.reload")}
          </button>
        </div>
      </div>
    </div>
  );
}
