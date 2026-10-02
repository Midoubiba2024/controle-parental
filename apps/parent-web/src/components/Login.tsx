import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
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
        setMsg("Compte créé. Vérifiez vos e-mails si la confirmation est requise, puis connectez-vous.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // La session est captée par onAuthStateChange dans App.
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card center">
      <h1>Console parent</h1>
      <p className="muted">Contrôle parental transparent</p>
      <form onSubmit={submit}>
        <label>E-mail
          <input type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>Mot de passe
          <input type="password" value={password} required minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        </label>
        <button disabled={busy} type="submit">
          {busy ? "…" : mode === "signin" ? "Se connecter" : "Créer un compte"}
        </button>
      </form>
      <button className="link" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "Créer un compte parent" : "J'ai déjà un compte"}
      </button>
      {msg && <p className="msg">{msg}</p>}
      <p className="muted small">
        La double authentification (MFA) sera exigée pour les comptes parents (voir SETUP.md).
      </p>
    </div>
  );
}
