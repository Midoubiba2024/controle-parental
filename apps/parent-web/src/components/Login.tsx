import { useState } from "react";
import { supabase } from "../lib/supabase";
import { errorMessage, useI18n } from "../i18n";

export function Login() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg(t("login.accountCreated"));
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // La session est captée par onAuthStateChange dans App.
      }
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card center">
      <h1>{t("login.title")}</h1>
      <p className="muted">{t("login.tagline")}</p>
      <form onSubmit={submit}>
        <label>{t("login.email")}
          <input type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>{t("login.password")}
          <input type="password" value={password} required minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        </label>
        <button disabled={busy} type="submit">
          {busy ? t("common.busy") : mode === "signin" ? t("login.signIn") : t("login.signUp")}
        </button>
      </form>
      <button className="link" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? t("login.switchToSignUp") : t("login.switchToSignIn")}
      </button>
      {msg && <p className="msg">{msg}</p>}
      <p className="muted small">
        {t("login.mfaNotice")}
      </p>
    </div>
  );
}
