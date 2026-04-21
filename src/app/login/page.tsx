"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
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
          setErr("Email non verificata. Clicca il link nell'email o richiedine uno nuovo.");
        } else {
          setErr("Email o password non corretti.");
        }
        return;
      }
      window.location.href = res.url ?? callbackUrl;
    } catch {
      setErr("Errore di rete. Riprova.");
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
        <Link
          href="/"
          className="flex items-center gap-2.5"
          style={{
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: "-0.02em",
            color: "var(--fg)",
          }}
        >
          <span
            className="mono inline-flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              background: "var(--fg)",
              color: "var(--bg)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "-0.04em",
            }}
          >
            L
          </span>
          LavorAI
        </Link>

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
                {plan ? "Pochi secondi per iniziare." : "Bentornato."}
              </h1>
              <p
                style={{
                  fontSize: 14.5,
                  color: "var(--fg-muted)",
                  lineHeight: 1.5,
                  margin: "0 0 28px",
                }}
              >
                {plan
                  ? "Accedi per continuare al checkout."
                  : "Accedi al tuo account."}
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
                  <span>Link non valido o scaduto. Richiedi un nuovo link.</span>
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
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mario.rossi@esempio.it"
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
                    Password
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
                    Dimenticata?
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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
                      <span>Email inviata. Controlla la posta (anche spam).</span>
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
                        {resending ? "Invio..." : "Reinvia link di verifica"}
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
                      <Icon name="refresh" size={14} /> Accesso...
                    </>
                  ) : (
                    <>
                      Accedi <Icon name="arrow-right" size={14} />
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
                Non hai un account?{" "}
                <Link
                  href={`/signup${plan ? `?plan=${plan}` : ""}`}
                  style={{
                    color: "var(--fg)",
                    fontWeight: 500,
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  Registrati gratis
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
          background: var(--bg);
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
          background: var(--bg-sunken);
          padding: 56px;
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
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(60% 50% at 70% 30%, oklch(0.62 0.13 155 / 0.18) 0%, transparent 60%), radial-gradient(50% 40% at 20% 80%, oklch(0.55 0.12 240 / 0.12) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          transform: "rotate(-3deg)",
          marginBottom: 20,
        }}
      >
        <div
          className="ds-cv-preview"
          style={{
            width: 360,
            background: "#fff",
            padding: "24px 28px",
            boxShadow:
              "0 30px 80px -20px rgba(15,16,18,0.24), 0 10px 30px -10px rgba(15,16,18,0.12)",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Giulia Rinaldi
          </div>
          <div style={{ fontSize: 10.5, color: "#5B5D61", marginBottom: 10 }}>
            Senior Product Designer · Milano
          </div>
          <CvH>Esperienza</CvH>
          <CvItem
            h="Senior Product Designer · Satispay"
            m="2023 – oggi"
            body="Lead design su app pagamenti (2M+ utenti). +34% conversion."
            highlight
          />
          <CvItem
            h="Product Designer · Nexi"
            m="2020 – 2023"
            body="Design system enterprise per prodotti payment."
          />
          <CvH>Competenze</CvH>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {["Figma", "Design Systems", "User Research", "Prototyping"].map(
              (s) => (
                <span
                  key={s}
                  style={{
                    fontSize: 9,
                    padding: "1px 6px",
                    border: "1px solid #E6E4DD",
                    borderRadius: 3,
                    color: "#0F1012",
                  }}
                >
                  {s}
                </span>
              ),
            )}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: -16,
            right: -24,
            padding: "8px 12px",
            borderRadius: 10,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-ds)",
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transform: "rotate(4deg)",
          }}
        >
          <Icon name="sparkles" size={12} style={{ color: "var(--primary-ds)" }} />
          <span style={{ fontSize: 11.5, fontWeight: 500 }}>
            Ottimizzato per Satispay
          </span>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: -14,
            left: -20,
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-ds)",
            boxShadow: "var(--shadow-lg)",
            transform: "rotate(-2deg)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--fg-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            ATS Score
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
              marginTop: 2,
            }}
          >
            <span
              style={{ fontSize: 18, fontWeight: 700, color: "var(--primary-ds)" }}
            >
              94
            </span>
            <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>/100</span>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 60,
          textAlign: "center",
          maxWidth: 440,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            marginBottom: 10,
          }}
        >
          &ldquo;In 2 settimane, 3 colloqui. Ore risparmiate ogni giorno.&rdquo;
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
          Marco · Full-stack developer, Milano
        </div>

        <div
          style={{
            marginTop: 32,
            display: "flex",
            justifyContent: "center",
            gap: 24,
          }}
        >
          <Stat value="10k+" label="candidature inviate" />
          <Stat value="82%" label="match medio" />
          <Stat value="30s" label="per candidatura" />
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        color: "var(--fg-subtle)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--fg)",
          letterSpacing: "-0.02em",
          marginBottom: 2,
        }}
      >
        {value}
      </div>
      {label}
    </div>
  );
}

function CvH({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#5B5D61",
        margin: "12px 0 4px",
        borderBottom: "1px solid #E6E4DD",
        paddingBottom: 3,
      }}
    >
      {children}
    </div>
  );
}

function CvItem({
  h,
  m,
  body,
  highlight,
}: {
  h: string;
  m: string;
  body?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        marginBottom: 8,
        padding: highlight ? "5px 8px" : undefined,
        background: highlight ? "oklch(0.95 0.03 155)" : undefined,
        borderRadius: highlight ? 4 : undefined,
        marginLeft: highlight ? -8 : undefined,
        marginRight: highlight ? -8 : undefined,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 600 }}>{h}</div>
      <div style={{ fontSize: 9.5, color: "#5B5D61" }}>{m}</div>
      {body && (
        <div style={{ fontSize: 9.5, color: "#0F1012", marginTop: 2 }}>{body}</div>
      )}
    </div>
  );
}
