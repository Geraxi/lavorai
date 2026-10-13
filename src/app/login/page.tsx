"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Icon } from "@/components/design/icon";
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

                <div style={{ marginTop: 14 }}>
                  <GoogleButton mode="login" position="below" callbackUrl={callbackUrl} />
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
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: "1px solid var(--border-ds)",
                  display: "grid",
                  gap: 6,
                  fontSize: 12,
                }}
              >
                <Benefit icon="zap" text={t("loginBenefit1")} />
                <Benefit icon="sparkles" text={t("loginBenefit2")} />
                <Benefit icon="target" text={t("loginBenefit3")} />
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
          {t("loginFooterPre")}
          <Link href="/termini" style={{ color: "var(--fg-muted)" }}>
            {t("loginFooterTerms")}
          </Link>
          {t("loginFooterMid")}
          <Link href="/privacy" style={{ color: "var(--fg-muted)" }}>
            {t("loginFooterPrivacy")}
          </Link>
          {t("loginFooterPost")}
        </p>
      </div>

      <LoginShowcase />

      <style>{`
        .lavorai-login {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(420px, .72fr) minmax(0, 1.28fr);
          background: #020611;
          color: var(--fg);
        }
        .lavorai-login-left {
          position: relative;
          z-index: 2;
          padding: 42px clamp(34px, 4vw, 72px);
          display: flex;
          flex-direction: column;
          background: linear-gradient(160deg, #040914 0%, #020611 68%);
          border-right: 1px solid rgba(160, 255, 221, .14);
        }
        .lavorai-login-left::before { content: ""; position: absolute; inset: 0 0 auto; height: 1px; background: linear-gradient(90deg, transparent, rgba(87, 239, 193, .6), transparent); opacity: .7; }
        .lavorai-login-left input { border-radius: 4px !important; }
        .lavorai-login-left button { border-radius: 4px !important; }
        .lavorai-login-right {
          position: relative;
          overflow: hidden;
          background: #02060d url("/login-showcase-scene.jpg") center / cover no-repeat;
          padding: 64px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        .lavorai-login-right::before { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(2,6,13,.74), rgba(2,6,13,.08) 42%, rgba(2,6,13,.08)), linear-gradient(180deg, rgba(2,6,13,.15), rgba(2,6,13,.58)); }
        .login-showcase-cue { position: relative; z-index: 1; align-self: flex-start; max-width: 330px; margin: auto 0 10vh 8%; padding-left: 17px; border-left: 1px solid rgba(87, 239, 193, .86); color: rgba(255,255,255,.86); }
        .login-showcase-cue p { margin: 0 0 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; letter-spacing: .15em; text-transform: uppercase; color: #60e9bf; }
        .login-showcase-cue h2 { margin: 0; font-size: clamp(1.35rem, 2vw, 2.2rem); font-weight: 540; letter-spacing: -.045em; line-height: 1.02; }
        .login-showcase-cue span { display: block; margin-top: 16px; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,.58); }
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
    <aside
      className="lavorai-login-right"
      aria-label="LavorAI trova opportunità e prepara candidature personalizzate"
    >
      <div className="login-showcase-cue" aria-hidden>
        <p>Candidate intelligence / 24·7</p>
        <h2>Tu scegli la direzione.<br />Noi rendiamo il lavoro continuo.</h2>
        <span>Ricerca, adattamento e invio: ogni passo resta visibile e sotto il tuo controllo.</span>
      </div>
    </aside>
  );
}
