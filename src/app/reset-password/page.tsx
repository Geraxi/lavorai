"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/design/icon";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetContent />
    </Suspense>
  );
}

function ResetContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setErr("La password deve essere di almeno 8 caratteri.");
      return;
    }
    if (password !== confirm) {
      setErr("Le due password non coincidono.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.message ?? "Link non valido o scaduto.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setErr("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <CenteredMessage
        title="Link non valido"
        body="Questo link di reset password non è valido. Richiedine uno nuovo."
        cta={{ href: "/forgot-password", label: "Nuovo link reset" }}
      />
    );
  }

  return (
    <div className="lavorai-login font-sans">
      <div className="lavorai-login-left">
        <Logo size="md" />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 380, width: "100%" }}>
          {done ? (
            <>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--primary-weak)", color: "var(--primary-ds)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <Icon name="check" size={22} />
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.025em", margin: "0 0 10px" }}>
                Password aggiornata
              </h1>
              <p style={{ fontSize: 14.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
                Ti reindirizziamo al login...
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.025em", margin: "0 0 10px", lineHeight: 1.1 }}>
                Scegli una nuova password
              </h1>
              <p style={{ fontSize: 14.5, color: "var(--fg-muted)", lineHeight: 1.5, margin: "0 0 28px" }}>
                Minimo 8 caratteri. Usane una che non hai mai usato altrove.
              </p>

              <form onSubmit={onSubmit}>
                <label htmlFor="password" style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-muted)", display: "block", marginBottom: 6 }}>
                  Nuova password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoFocus
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimo 8 caratteri"
                  className="ds-input"
                  style={{ padding: "10px 12px", fontSize: 14, marginBottom: 14 }}
                />

                <label htmlFor="confirm" style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-muted)", display: "block", marginBottom: 6 }}>
                  Conferma password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Ripeti la password"
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
                      <Icon name="refresh" size={14} /> Salvataggio...
                    </>
                  ) : (
                    <>
                      Aggiorna password <Icon name="arrow-right" size={14} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="lavorai-login-right">
        <div className="lavorai-login-showcase">
          <div style={{ fontSize: 42, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.05 }}>
            Quasi fatto.
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

function CenteredMessage({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 10px" }}>{title}</h1>
        <p style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.5, margin: "0 0 20px" }}>{body}</p>
        <Link href={cta.href} className="ds-btn ds-btn-primary">
          {cta.label}
        </Link>
      </div>
    </div>
  );
}
