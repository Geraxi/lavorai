"use client";

import { observeGoogleCallbackError } from "@/lib/google-login-observation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthShell, PasswordInput } from "@/components/auth/auth-shell";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Icon } from "@/components/design/icon";
import { authErrorMessageKey } from "@/lib/auth-errors";
import { GoogleButton } from "@/components/google-signin-button";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const plan = params.get("plan");
  const intervalQuery = params.get("interval") === "year" ? "&interval=year" : "";
  const errorKey = authErrorMessageKey(params);
  const callbackError = params.getAll("error").find(value => value !== "1") ?? null;
  useEffect(() => { observeGoogleCallbackError(callbackError); }, [callbackError]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(params.get("verify") === "required" ? t("errorEmailNotVerified") : null);
  const [needsVerify, setNeedsVerify] = useState(params.get("verify") === "required");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  const callbackUrl = plan ? `/settings?upgrade=${plan}${intervalQuery}` : next;

  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setNeedsVerify(false);
    try {
      const res = await signIn("password", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      if (!res || res.error) {
        const errorCode = res?.error;
        
        if (errorCode === "no_password") {
          setErr("Questo account non ha una password. Accedi con Google o imposta una password tramite 'Password dimenticata'.");
          return;
        }
        
        if (errorCode === "server_error") {
          setErr("Errore del server. Riprova tra qualche istante.");
          return;
        }
        
        const status = await fetch("/api/auth/verify-email/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        })
          .then((r) => r.json())
          .catch(() => null);
        if (status?.needsVerify) {
          setNeedsVerify(true);
          setErr(t("errorEmailNotVerified"));
        } else {
          setErr(t("errorInvalidCredentials"));
        }
        return;
      }
      window.location.href = res.url ?? callbackUrl;
    } catch {
      setErr(t("errorNetwork"));
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!email) return;
    setResending(true);
    try {
      await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResendDone(true);
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell>
      <h1>{plan ? t("loginHeadingCheckout") : t("loginHeadingDefault")}</h1>
      <p className="auth-subtitle">{plan ? t("loginSubtitleCheckout") : t("loginSubtitleDefault")}</p>
      {errorKey && <p className="auth-error" role="alert">{t(errorKey)}</p>}
      <div className="auth-google"><GoogleButton mode="login" position="above" callbackUrl={callbackUrl} /></div>
      <form onSubmit={onPasswordSubmit} className="auth-form">
        <label htmlFor="email">{t("email")}</label>
        <input id="email" type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholderExample")} className="auth-input" />
        <label htmlFor="password">{t("password")}</label>
        <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("passwordPlaceholderDots")} />
        <Link className="auth-forgot" href="/forgot-password">{t("passwordForgot")}</Link>
        {err && <p className="auth-error" role="alert">{err}</p>}
        {needsVerify && <div className="auth-notice" role="status">
          {resendDone ? <span>{t("verifyEmailSent")}</span> : <button type="button" onClick={resendVerification} disabled={resending}>{resending ? t("verifyResending") : t("verifyResend")}</button>}
        </div>}
        <button type="submit" disabled={loading || !password} className="auth-submit">
          {loading ? <><Icon name="refresh" size={14} /> {t("loginSubmitting")}</> : t("submitLogin")}
        </button>
      </form>
      <p className="auth-switch">{t("noAccountQuestion")} <Link href={`/signup${plan ? `?plan=${plan}${intervalQuery}` : ""}`}>{t("submitSignup")}</Link></p>
      <p className="auth-terms">{t("loginFooterPre")}<Link href="/termini">{t("loginFooterTerms")}</Link>{t("loginFooterMid")}<Link href="/privacy">{t("loginFooterPrivacy")}</Link>{t("loginFooterPost")}</p>
    </AuthShell>
  );
}
