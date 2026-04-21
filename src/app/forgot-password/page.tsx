"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon } from "@/components/design/icon";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setErr("Qualcosa è andato storto. Riprova tra qualche minuto.");
        return;
      }
      setSent(true);
    } catch {
      setErr("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lavorai-login font-sans">
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
          {sent ? (
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
              <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.025em", margin: "0 0 10px" }}>
                Controlla la tua email
              </h1>
              <p style={{ fontSize: 14.5, color: "var(--fg-muted)", lineHeight: 1.5, margin: 0 }}>
                Se{" "}
                <span style={{ color: "var(--fg)", fontWeight: 500 }}>{email}</span>{" "}
                è registrata, ti abbiamo inviato un link per reimpostare la password. Il link scade tra 30 minuti.
              </p>
              <Link
                href="/login"
                className="ds-btn"
                style={{ marginTop: 28, alignSelf: "flex-start" }}
              >
                ← Torna al login
              </Link>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.025em", margin: "0 0 10px", lineHeight: 1.1 }}>
                Password dimenticata?
              </h1>
              <p style={{ fontSize: 14.5, color: "var(--fg-muted)", lineHeight: 1.5, margin: "0 0 28px" }}>
                Inserisci la tua email e ti invieremo un link per reimpostarla.
              </p>

              <form onSubmit={onSubmit}>
                <label htmlFor="email" style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-muted)", display: "block", marginBottom: 6 }}>
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
                  style={{ padding: "10px 12px", fontSize: 14 }}
                />
                {err && (
                  <p style={{ fontSize: 12, color: "var(--red-ds)", marginTop: 8 }}>
                    {err}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="ds-btn ds-btn-primary"
                  style={{ width: "100%", padding: "12px 18px", fontSize: 14, marginTop: 14 }}
                >
                  {loading ? (
                    <>
                      <Icon name="refresh" size={14} /> Invio...
                    </>
                  ) : (
                    <>
                      Invia link reset <Icon name="arrow-right" size={14} />
                    </>
                  )}
                </button>
              </form>

              <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 20, textAlign: "center" }}>
                <Link href="/login" style={{ color: "var(--fg)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  ← Torna al login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>

      <div className="lavorai-login-right">
        <div className="lavorai-login-showcase">
          <div style={{ fontSize: 42, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.05 }}>
            Niente panico.
          </div>
          <div style={{ fontSize: 13.5, color: "var(--fg-muted)", lineHeight: 1.55, maxWidth: 440, marginTop: 16 }}>
            Un link via email, scegli una nuova password, e sei subito dentro.
          </div>
        </div>
      </div>

      <style>{`
        .lavorai-login { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 480px) minmax(0, 1fr); background: var(--bg); color: var(--fg); }
        .lavorai-login-left { padding: 40px 48px; display: flex; flex-direction: column; }
        .lavorai-login-right { position: relative; background: var(--bg-sunken); display: flex; align-items: center; padding: 64px; border-left: 1px solid var(--border-ds); }
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
