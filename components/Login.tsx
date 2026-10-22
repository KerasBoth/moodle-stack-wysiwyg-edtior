"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { useT } from "./I18nProvider";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Login({ setup, next }: { setup: boolean; next: string }) {
  const t = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setup && password !== password2) return setError(t("login.mismatch"));
    setBusy(true);
    try {
      await api(setup ? "/api/auth/setup" : "/api/auth/login", { body: { username, password } });
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <LanguageSwitcher className="auth-lang" />
      <form className="auth-card" onSubmit={submit}>
        <div className="brand auth-brand">
          <div className="brand-mark">S</div>
          {t("common.appName")} <small>{t("common.forMoodle")}</small>
        </div>
        <h1>{setup ? t("login.setupTitle") : t("login.title")}</h1>
        {setup && <p className="auth-note">{t("login.setupNote")}</p>}
        <div className="field">
          <label htmlFor="u">{t("login.username")}</label>
          <input id="u" className="inp" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="p">{t("login.password")} {setup && <span className="hint">{t("login.minLength")}</span>}</label>
          <input id="p" className="inp" type="password" autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {setup && (
          <div className="field">
            <label htmlFor="p2">{t("login.passwordRepeat")}</label>
            <input id="p2" className="inp" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
          </div>
        )}
        {error && <div className="issue error">{error}</div>}
        <button className="btn primary auth-submit" disabled={busy}>{busy ? t("login.pleaseWait") : setup ? t("login.createAccount") : t("login.submit")}</button>
      </form>
    </div>
  );
}
