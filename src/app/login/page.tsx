"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Icon } from "@/components/design/icon";

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
  const error = params.get("error") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  const callbackUrl = plan ? `/settings?upgrade=${plan}` : next;

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
        // NextAuth comprime gli errori del provider in un generico "CredentialsSignin".
        // Distinguere "email non verificata" vs "password sbagliata" richiede un
        // check lato client: proviamo a verificare lo stato via endpoint dedicato.
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
          <h1
                style={{
                  fontSize: 32,
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                  margin: "0 0 10px",
                  lineHeight: 1.1,
                }}
              >
                {plan ? t("loginHeadingCheckout") : t("loginHeadingDefault")}
              </h1>
              <p
                style={{
                  fontSize: 14.5,
                  color: "var(--fg-muted)",
                  lineHeight: 1.5,
                  margin: "0 0 28px",
                }}
              >
                {plan ? t("loginSubtitleCheckout") : t("loginSubtitleDefault")}
              </p>

              {error && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "var(--red-weak)",
                    color: "var(--red-ds)",
                    fontSize: 12.5,
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "start",
                    gap: 8,
                  }}
                >
                  <Icon name="x" size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>{t("errorLinkInvalid")}</span>
                </div>
              )}

              <form onSubmit={onPasswordSubmit}>
                <label
                  htmlFor="email"
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--fg-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  {t("email")}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("emailPlaceholderExample")}
                  className="ds-input"
                  style={{ padding: "10px 12px", fontSize: 14, marginBottom: 14 }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 6,
                  }}
                >
                  <label
                    htmlFor="password"
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--fg-muted)",
                    }}
                  >
                    {t("password")}
                  </label>
                  <Link
                    href="/forgot-password"
                    style={{
                      fontSize: 11.5,
                      color: "var(--fg-muted)",
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    {t("passwordForgotShort")}
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("passwordPlaceholderDots")}
                  className="ds-input"
                  style={{ padding: "10px 12px", fontSize: 14 }}
                />
                {err && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--red-ds)",
                      marginTop: 8,
                    }}
                  >
                    {err}
                  </p>
                )}
                {needsVerify && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      borderRadius: 6,
                      background: "var(--amber-weak)",
                      fontSize: 12.5,
                    }}
                  >
                    {resendDone ? (
                      <span>{t("verifyEmailSent")}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={resendVerification}
                        disabled={resending}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "var(--fg)",
                          textDecoration: "underline",
                          cursor: "pointer",
                          fontSize: 12.5,
                        }}
                      >
                        {resending ? t("verifyResending") : t("verifyResend")}
                      </button>
                    )}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || !password}
                  className="ds-btn ds-btn-primary"
                  style={{
                    width: "100%",
                    padding: "12px 18px",
                    fontSize: 14,
                    marginTop: 14,
                  }}
                >
                  {loading ? (
                    <>
                      <Icon name="refresh" size={14} /> {t("loginSubmitting")}
                    </>
                  ) : (
                    <>
                      {t("submitLogin")} <Icon name="arrow-right" size={14} />
                    </>
                  )}
                </button>
              </form>

              <p
                style={{
                  fontSize: 13,
                  color: "var(--fg-muted)",
                  marginTop: 24,
                  textAlign: "center",
                }}
              >
                {t("noAccountQuestion")}{" "}
                <Link
                  href={`/signup${plan ? `?plan=${plan}` : ""}`}
                  style={{
                    color: "var(--fg)",
                    fontWeight: 500,
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  {t("signupFree")}
                </Link>
              </p>

              <div
                style={{
                  marginTop: 28,
                  paddingTop: 20,
                  borderTop: "1px solid var(--border-ds)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <Benefit icon="zap" text="Candidati in automatico su portali italiani e internazionali" />
                <Benefit icon="sparkles" text="CV e cover letter adattati ad ogni annuncio" />
                <Benefit icon="target" text="3 candidature gratis per provare — no carta" />
              </div>
        </div>

        <p
          style={{
            fontSize: 11.5,
            color: "var(--fg-subtle)",
            lineHeight: 1.5,
            marginTop: 24,
          }}
        >
          Continuando accetti i nostri{" "}
          <Link href="/termini" style={{ color: "var(--fg-muted)" }}>
            termini
          </Link>{" "}
          e la{" "}
          <Link href="/privacy" style={{ color: "var(--fg-muted)" }}>
            privacy policy
          </Link>
          . Dati processati in UE · GDPR-compliant.
        </p>
      </div>

      <LoginShowcase />

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
          background:
            linear-gradient(to bottom, rgba(1, 5, 16, 0.6), rgba(1, 5, 16, 0.6)),
            url('/signup-showcase.png');
          background-size: cover;
          background-position: center;
          padding: 80px 56px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          border-left: 1px solid var(--border-ds);
        }
        @media (max-width: 1023px) {
          .lavorai-login { grid-template-columns: 1fr; }
          .lavorai-login-left { padding: 28px 20px; }
          .lavorai-login-right { display: none; }
        }
      `}</style>
    </div>
  );
}

function Benefit({
  icon,
  text,
}: {
  icon: "zap" | "sparkles" | "target";
  text: string;
}) {
  return (
    <div
      className="flex items-start gap-2.5"
      style={{ fontSize: 13, color: "var(--fg-muted)" }}
    >
      <div
        style={{
          flex: "0 0 auto",
          width: 22,
          height: 22,
          borderRadius: 5,
          background: "var(--primary-weak)",
          color: "var(--primary-ds)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <Icon name={icon} size={12} />
      </div>
      <span>{text}</span>
    </div>
  );
}

function LoginShowcase() {
  return (
    <div className="lavorai-login-right">
      <div 
        className="lavorai-login-showcase ds-glass" 
        style={{
          maxWidth: 580,
          padding: "48px",
          borderRadius: "24px",
          background: "rgba(1, 5, 16, 0.55)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 32px 80px -20px rgba(0,0,0,0.8)"
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
  );
}
