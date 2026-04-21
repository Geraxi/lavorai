"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/design/icon";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}

function SignupContent() {
  const params = useSearchParams();
  const plan = params.get("plan");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consent) {
      setErr("Devi accettare la privacy policy per continuare.");
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
                Controlla la tua email
              </h1>
              <p
                style={{
                  fontSize: 14.5,
                  color: "var(--fg-muted)",
                  lineHeight: 1.5,
                }}
              >
                Ti abbiamo inviato un link di verifica a{" "}
                <span style={{ color: "var(--fg)", fontWeight: 500 }}>
                  {email}
                </span>
                . Clicca il link per attivare l&apos;account e accedere. Il link scade tra 24 ore.
              </p>
              <Link
                href="/login"
                className="ds-btn"
                style={{ marginTop: 24, alignSelf: "flex-start" }}
              >
                ← Torna al login
              </Link>
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
            Crea il tuo account
          </h1>
          <p
            style={{
              fontSize: 14.5,
              color: "var(--fg-muted)",
              lineHeight: 1.5,
              margin: "0 0 28px",
            }}
          >
            3 candidature gratis per provare — niente carta richiesta.
          </p>

          <form onSubmit={onSubmit}>
            <Label htmlFor="name">Nome</Label>
            <input
              id="name"
              type="text"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mario Rossi"
              className="ds-input"
              style={{ padding: "10px 12px", fontSize: 14, marginBottom: 14 }}
            />

            <Label htmlFor="email">Email</Label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mario.rossi@esempio.it"
              className="ds-input"
              style={{ padding: "10px 12px", fontSize: 14, marginBottom: 14 }}
            />

            <Label htmlFor="password">Password</Label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 char · 1 maiuscola · 1 numero"
              className="ds-input"
              style={{ padding: "10px 12px", fontSize: 14 }}
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
                Ho letto la{" "}
                <Link
                  href="/privacy"
                  style={{ color: "var(--fg)", textDecoration: "underline" }}
                >
                  privacy policy
                </Link>{" "}
                e autorizzo il trattamento dei dati.
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
                padding: "12px 18px",
                fontSize: 14,
                marginTop: 18,
              }}
            >
              {loading ? (
                <>
                  <Icon name="refresh" size={14} /> Creazione account...
                </>
              ) : (
                <>
                  Crea account <Icon name="arrow-right" size={14} />
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
            Hai già un account?{" "}
            <Link
              href={`/login${plan ? `?plan=${plan}` : ""}`}
              style={{
                color: "var(--fg)",
                fontWeight: 500,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Accedi
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
          Creando l&apos;account accetti i nostri{" "}
          <Link href="/termini" style={{ color: "var(--fg-muted)" }}>
            termini
          </Link>
          . Dati processati in UE · GDPR-compliant.
        </p>
      </div>

      {/* RIGHT — showcase (solo desktop) */}
      <div className="lavorai-login-right">
        <div className="lavorai-login-showcase">
          <div
            style={{
              fontSize: 14,
              color: "var(--fg-muted)",
              marginBottom: 10,
              letterSpacing: "0.02em",
            }}
          >
            Se i recruiter usano l&apos;AI,
          </div>
          <div
            style={{
              fontSize: 42,
              fontWeight: 600,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              marginBottom: 32,
            }}
          >
            perché tu no?
          </div>
          <div
            style={{
              fontSize: 13.5,
              color: "var(--fg-muted)",
              lineHeight: 1.55,
              maxWidth: 440,
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
          background: var(--bg-sunken);
          display: flex;
          align-items: center;
          padding: 64px;
          border-left: 1px solid var(--border-ds);
        }
        .lavorai-login-showcase { max-width: 520px; }
        @media (max-width: 860px) {
          .lavorai-login { grid-template-columns: 1fr; }
          .lavorai-login-right { display: none; }
          .lavorai-login-left { padding: 28px 20px; }
        }
      `}</style>
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
