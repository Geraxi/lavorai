"use client";

import { normalizeInterval } from "@/lib/billing";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { AuthShell, PasswordInput } from "@/components/auth/auth-shell";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/design/icon";
import { GoogleButton } from "@/components/google-signin-button";
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}

function SignupContent() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const plan = params.get("plan");
  const interval = normalizeInterval(params.get("interval"));
  const protectedCategory = params.get("protected") === "1";
  const promo = params.get("promo")?.toUpperCase() ?? null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  useEffect(() => {
    trackEvent(AnalyticsEvent.SIGNUP_START, { plan: plan ?? "free" });
    if (plan === "pro" || plan === "pro_plus") {
      try {
        localStorage.setItem("lavorai.selectedPlan", plan);
        localStorage.setItem("lavorai.selectedInterval", interval);
      } catch {
        /* storage unavailable */
      }
    } else {
      try {
        localStorage.removeItem("lavorai.selectedPlan");
        localStorage.removeItem("lavorai.selectedInterval");
      } catch {
        /* storage unavailable */
      }
    }
  }, [plan, interval]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consent) {
      setErr(t("errorPrivacyRequired"));
      return;
    }
    if (password !== confirmPassword) {
      setErr(t("errorPasswordMismatch"));
      return;
    }
    setLoading(true);
    setErr(null);
    trackEvent(AnalyticsEvent.SIGNUP_SUBMIT, {
      plan: plan ?? "free",
    });
    try {
      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: name || undefined,
          privacyConsent: true,
          protectedCategory: protectedCategory || undefined,
          promo: promo || undefined,
          plan: plan === "pro" || plan === "pro_plus" ? plan : "free",
        }),
      });
      const body = await signupRes.json().catch(() => ({}));
      if (!signupRes.ok) {
        trackEvent(AnalyticsEvent.SIGNUP_FAIL, {
          plan: plan ?? "free",
          reason: typeof body?.error === "string" ? body.error : "unknown",
        });
        setErr(body?.message ?? "Impossibile creare l'account. Riprova.");
        return;
      }
      // Meta CompleteRegistration is NOT fired here: the server issued a
      // one-shot event ID at account creation, claimed on the first
      // authenticated page (components/registration-conversion.tsx) and only
      // sent with advertising consent.
      const result = await signIn("password", { email, password, redirect: false }).catch(() => null);
      if (result && !result.error) {
        window.location.href = plan === "pro" || plan === "pro_plus"
          ? `/settings?upgrade=${plan}${interval === "year" ? "&interval=year" : ""}`
          : "/onboarding";
        return;
      }
      setCreated(true);
    } catch {
      trackEvent(AnalyticsEvent.SIGNUP_FAIL, {
        plan: plan ?? "free",
        reason: "network",
      });
      setErr("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {created ? <div className="auth-created" role="status">
        <Icon name="inbox" size={32} />
        <h1>{t("verifyEmailTitle")}</h1>
        <p className="auth-subtitle">{t("verifyEmailBody1")} <strong>{email}</strong>. {t("verifyEmailBody2")}</p>
        <div className="auth-created-links"><Link href="/login">{t("backToLogin")}</Link><Link href="/#prezzi">{t("choosePlan")}</Link></div>
      </div> : <>
        <h1>{t("signupHeading")}</h1>
        <p className="auth-subtitle">{t("signupSubheading")}</p>
        <div className="auth-google"><GoogleButton mode="signup" position="above" /></div>
        <form onSubmit={onSubmit} className="auth-form">
          <label htmlFor="name">{t("name")}</label>
          <input id="name" type="text" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} className="auth-input" />
          <label htmlFor="email">{t("email")}</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholderExample")} className="auth-input" />
          <label htmlFor="password">{t("password")}</label>
          <PasswordInput id="password" required autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("passwordPlaceholderDots")} aria-describedby="password-help" />
          <p id="password-help" className="auth-help">{t("passwordPlaceholderSignup")}</p>
          <label htmlFor="confirmPassword">{t("confirmPassword")}</label>
          <PasswordInput id="confirmPassword" required autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("confirmPasswordPlaceholder")} aria-invalid={confirmPassword.length > 0 && confirmPassword !== password} />
          <label className="auth-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t("consentRead")} <Link href="/privacy">{t("privacyNotice")}</Link> {t("consentAuthorize")}</span>
          </label>
          {err && <p className="auth-error" role="alert">{err}</p>}
          <button type="submit" disabled={loading} className="auth-submit">{loading ? <><Icon name="refresh" size={14} /> {t("creating")}</> : t("submitSignup")}</button>
          <p className="auth-terms">{t("termsFootnotePre")}<Link href="/termini">{t("termsFootnoteLink")}</Link>{t("termsFootnotePost")}</p>
        </form>
        <p className="auth-switch">{t("haveAccountQuestion")} <Link href={`/login${plan ? `?plan=${plan}${interval === "year" ? "&interval=year" : ""}` : ""}`}>{t("loginLink2")}</Link></p>
      </>}
    </AuthShell>
  );
}
