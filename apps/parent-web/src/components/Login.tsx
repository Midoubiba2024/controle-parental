import { useState } from "react";
import { Eye, EyeOff, FileText, LogIn, ShieldCheck, UserPlus, Waypoints } from "lucide-react";
import { supabase } from "../lib/supabase";
import { errorMessage, useI18n } from "../i18n";
import { ic, Logo } from "./icons";

export function Login() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  // Message affiché dans une région TOUJOURS montée (annoncée à coup sûr) :
  // info (compte créé) en role=status, erreur en role=alert.
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg({ text: t("login.accountCreated"), error: false });
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // La session est captée par onAuthStateChange dans App.
      }
    } catch (err) {
      setMsg({ text: errorMessage(err), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-brand" aria-labelledby="auth-headline">
        <span className="auth-deco" aria-hidden="true"><Logo size={240} /></span>
        <div className="brand">
          <span className="brand-logo"><Logo size={26} /></span>
          {/* Sous-titre « Console parent » omis : c'est déjà le titre du formulaire. */}
          <span className="brand-name">{t("dashboard.brand")}</span>
        </div>
        <p id="auth-headline" className="auth-headline">{t("login.headline")}</p>
        <p className="auth-lead">{t("login.lead")}</p>
        <ul className="auth-points">
          <li><span className="pt-ic"><ShieldCheck {...ic} size={18} /></span><span className="pt-long">{t("login.points.visible")}</span><span className="pt-short">{t("login.pointsShort.visible")}</span></li>
          <li><span className="pt-ic"><Waypoints {...ic} size={18} /></span><span className="pt-long">{t("login.points.metadata")}</span><span className="pt-short">{t("login.pointsShort.metadata")}</span></li>
          <li><span className="pt-ic"><FileText {...ic} size={18} /></span><span className="pt-long">{t("login.points.audit")}</span><span className="pt-short">{t("login.pointsShort.audit")}</span></li>
        </ul>
      </section>

      <main className="auth-main">
        <div className="card auth-card">
          <h1>{t("login.title")}</h1>
          <p className="card-sub">{mode === "signin" ? t("login.signInSubtitle") : t("login.signUpSubtitle")}</p>
          <form onSubmit={submit}>
            <label htmlFor="login-email">{t("login.email")}
              <input id="login-email" type="email" value={email} required inputMode="email"
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            {/* Le label ne contient QUE le champ : le bouton afficher/masquer a son propre nom. */}
            <div className="fld">
              <label htmlFor="login-password">{t("login.password")}</label>
              <span className="pw-field">
                <input id="login-password" type={showPw ? "text" : "password"} value={password} required minLength={8}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"} />
                <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)}
                  aria-pressed={showPw} aria-controls="login-password"
                  aria-label={showPw ? t("login.hidePassword") : t("login.showPassword")}>
                  {showPw ? <EyeOff {...ic} /> : <Eye {...ic} />}
                </button>
              </span>
            </div>
            <button disabled={busy} type="submit" className="block" style={{ minHeight: 48, marginTop: 4 }}>
              {mode === "signin" ? <LogIn {...ic} size={18} className="flip-rtl" /> : <UserPlus {...ic} size={18} />}
              {busy ? t("common.busy") : mode === "signin" ? t("login.signIn") : t("login.signUp")}
            </button>
          </form>
          <p className="msg" role="status" aria-live="polite" style={{ marginTop: msg && !msg.error ? 14 : 0 }}>
            {msg && !msg.error ? msg.text : ""}
          </p>
          <p className="msg error" role="alert" style={{ marginTop: msg?.error ? 14 : 0 }}>
            {msg?.error ? msg.text : ""}
          </p>
          <div className="auth-switch">
            <button type="button" className="link" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}>
              {mode === "signin" ? t("login.switchToSignUp") : t("login.switchToSignIn")}
            </button>
          </div>
          <p className="auth-foot">
            <ShieldCheck {...ic} size={18} />
            {/* Phrase de transparence complète (le panneau de marque en donne la version courte). */}
            <span>{t("dashboard.footerPrivacy")}</span>
          </p>
        </div>
      </main>
    </div>
  );
}
