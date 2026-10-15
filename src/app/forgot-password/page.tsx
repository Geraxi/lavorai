"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
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
    <AuthShell>
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

              <form className="auth-form" onSubmit={onSubmit}>
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
                  className="auth-input"
                  style={{ padding: "10px 12px", fontSize: 14 }}
                />
                {err && (
                  <p role="alert" className="auth-error" style={{ marginTop: 8 }}>
                    {err}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="auth-submit"
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
    </AuthShell>
  );
}
