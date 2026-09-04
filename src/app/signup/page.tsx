"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/design/icon";
import { PaywallDialog } from "@/components/paywall-dialog";
import { GoogleButton } from "@/components/google-signin-button";

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

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    if (created) setPaywallOpen(true);
  }, [created]);

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
    try {
      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: name || undefined,
          privacyConsent: true,
        }),
      });
      const body = await signupRes.json().catch(() => ({}));
      if (!signupRes.ok) {
        setErr(body?.message ?? "Impossibile creare l'account. Riprova.");
        return;
      }
      // Track signup conversion su Meta+Google (retargeting audiences).
      try {
        const { trackConversion } = await import("@/components/tracking-pixels");
        trackConversion("CompleteRegistration", { content_name: "signup_email" });
        trackConversion("Lead");
      } catch {
        /* silenzioso — se pixel non caricato, non blocca il flow */
      }
      setCreated(true);
    } catch {
      setErr("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lavorai-login font-sans">
      {/* LEFT — Form */}
      <div className="lavorai-login-left">
        <Logo size="md" />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            maxWidth: 380,
            width: "100%",
          }}
        >
          {created ? (
            <>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "var(--primary-weak)",
                  color: "var(--primary-ds)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                <Icon name="inbox" size={22} />
              </div>
              <h1
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                  margin: "0 0 10px",
                }}
              >
                {t("verifyEmailTitle")}
              </h1>
              <p
                style={{
                  fontSize: 14.5,
                  color: "var(--fg-muted)",
                  lineHeight: 1.5,
                }}
              >
                {t("verifyEmailBody1")}{" "}
                <span style={{ color: "var(--fg)", fontWeight: 500 }}>
                  {email}
                </span>
                . {t("verifyEmailBody2")}
              </p>
              <div
                style={{
                  marginTop: 24,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignSelf: "flex-start",
                }}
              >
                <Link href="/login" className="ds-btn">
                  {t("backToLogin")}
                </Link>
                <button
                  type="button"
                  className="ds-btn ds-btn-ghost"
                  onClick={() => setPaywallOpen(true)}
                >
                  {t("choosePlan")}
                </button>
              </div>
            </>
          ) : (
            <>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: "-0.025em",
              margin: "0 0 10px",
              lineHeight: 1.1,
            }}
          >
            {t("signupHeading")}
          </h1>
          <p
            style={{
              fontSize: 14.5,
              color: "var(--fg-muted)",
              lineHeight: 1.5,
              margin: "0 0 28px",
            }}
          >
            {t("signupSubheading")}
          </p>

          <form onSubmit={onSubmit}>
            <Label htmlFor="name">{t("name")}</Label>
            <input
              id="name"
              type="text"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="ds-input"
              style={{ padding: "8px 12px", fontSize: 14, marginBottom: 10 }}
            />

            <Label htmlFor="email">{t("email")}</Label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholderExample")}
              className="ds-input"
              style={{ padding: "8px 12px", fontSize: 14, marginBottom: 10 }}
            />

            <Label htmlFor="password">{t("password")}</Label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholderSignup")}
              className="ds-input"
              style={{ padding: "8px 12px", fontSize: 14, marginBottom: 10 }}
            />

            <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
            <input
              id="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("confirmPasswordPlaceholder")}
              className="ds-input"
              style={{
                padding: "10px 12px",
                fontSize: 14,
                // Bordo rosso soft se le due password sono state entrambe
                // digitate ma non coincidono → feedback immediato senza
                // dover attendere il submit.
                borderColor:
                  confirmPassword.length > 0 && confirmPassword !== password
                    ? "rgba(220,38,38,0.55)"
                    : undefined,
              }}
              aria-invalid={
                confirmPassword.length > 0 && confirmPassword !== password
              }
            />

            <label
              style={{
                display: "flex",
                alignItems: "start",
                gap: 10,
                marginTop: 16,
                fontSize: 12.5,
                color: "var(--fg-muted)",
                cursor: "pointer",
                lineHeight: 1.4,
              }}
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 2, accentColor: "var(--fg)" }}
              />
              <span>
                {t("consentRead")}{" "}
                <Link
                  href="/privacy"
                  style={{ color: "var(--fg)", textDecoration: "underline" }}
                >
                  informativa privacy
                </Link>{" "}
                {t("consentAuthorize")}
              </span>
            </label>

            {err && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--red-ds)",
                  marginTop: 10,
                }}
              >
                {err}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="ds-btn ds-btn-primary"
              style={{
                width: "100%",
                padding: "11px 18px",
                fontSize: 14,
                marginTop: 12,
              }}
            >
              {loading ? (
                <>
                  <Icon name="refresh" size={14} /> {t("creating")}
                </>
              ) : (
                <>
                  {t("submitSignup")} <Icon name="arrow-right" size={14} />
                </>
              )}
            </button>

            {/* Trust microcopy SOTTO il submit — riduce abbandono carrello */}
            <p
              style={{
                fontSize: 11.5,
                color: "var(--fg-subtle)",
                marginTop: 10,
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              <Icon name="check" size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              {t("signupTrustFree")} ·{" "}
              <Icon name="check" size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              {t("signupTrustNoCard")} ·{" "}
              <Icon name="check" size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              {t("signupTrustCancel")}
            </p>

            <div style={{ marginTop: 10 }}>
              <GoogleButton mode="signup" position="below" />
            </div>
          </form>

          <p
            style={{
              fontSize: 13,
              color: "var(--fg-muted)",
              marginTop: 24,
              textAlign: "center",
            }}
          >
            {t("haveAccountQuestion")}{" "}
            <Link
              href={`/login${plan ? `?plan=${plan}` : ""}`}
              style={{
                color: "var(--fg)",
                fontWeight: 500,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              {t("loginLink2")}
            </Link>
          </p>


            </>
          )}
        </div>

        <p
          style={{
            fontSize: 11.5,
            color: "var(--fg-subtle)",
            lineHeight: 1.5,
            marginTop: 24,
          }}
        >
          {t("termsFootnotePre")}
          <Link href="/termini" style={{ color: "var(--fg-muted)" }}>
            {t("termsFootnoteLink")}
          </Link>
          {t("termsFootnotePost")}
        </p>
      </div>

      {/* RIGHT — showcase (solo desktop) */}
      <div className="lavorai-login-right">
        <div
          className="lavorai-login-showcase"
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 560,
          }}
        >
          <div
            style={{
              fontSize: 20,
              color: "var(--fg-muted)",
              marginBottom: 12,
              letterSpacing: "0.02em",
            }}
          >
            Se i recruiter usano l&apos;AI,
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              marginBottom: 40,
            }}
          >
            tu non puoi permetterti di non usarla.
          </div>
          <div
            style={{
              fontSize: 20,
              color: "var(--fg-muted)",
              lineHeight: 1.6,
              maxWidth: 580,
            }}
          >
            Smetti di candidarti. Inizia a essere chiamato.
            LavorAI scansiona i portali 24/7, adatta CV e lettera ad ogni
            annuncio e invia per te. Tu rispondi solo ai recruiter interessati.
          </div>
        </div>
      </div>

      <style>{`
        .lavorai-login {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 480px) minmax(0, 1fr);
          background: transparent;
          color: var(--fg);
        }
        .lavorai-login-left {
          padding: 40px 48px;
          display: flex;
          flex-direction: column;
        }
        .lavorai-login-right {
          position: relative;
          overflow: hidden;
          /* Stesso pattern del login: bitmap sgranato sostituito da
             gradient CSS pulito + ambient glow verdi + grid subtle. */
          background:
            radial-gradient(ellipse 70% 80% at 75% 25%, hsl(155 65% 38%) 0%, transparent 60%),
            radial-gradient(ellipse 55% 60% at 25% 80%, hsl(158 60% 30%) 0%, transparent 65%),
            linear-gradient(165deg, hsl(155 55% 25%) 0%, hsl(160 60% 18%) 100%);
          padding: 80px 56px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          border-left: 1px solid var(--border-ds);
        }
        .lavorai-login-right::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, #000 30%, transparent 80%);
          pointer-events: none;
        }
        .lavorai-login-showcase { max-width: 520px; }
        @media (max-width: 860px) {
          .lavorai-login { grid-template-columns: 1fr; }
          .lavorai-login-right { display: none; }
          .lavorai-login-left { padding: 28px 20px; }
        }
      `}</style>
      <PaywallDialog
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        variant="signup"
        headline="Account creato — scegli il piano"
        sub="Iniziamo gratis? Oppure passa a Pro: dopo il verify email ti porteremo al checkout."
      />
    </div>
  );
}

function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: "var(--fg-muted)",
        display: "block",
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  );
}

function Benefit({ icon, text }: { icon: "zap" | "sparkles" | "target"; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: "var(--primary-weak)",
          color: "var(--primary-ds)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={13} />
      </div>
      <span style={{ color: "var(--fg-muted)" }}>{text}</span>
    </div>
  );
}

