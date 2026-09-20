"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (newPassword !== confirmPassword) {
      setErr("Le nuove password non coincidono.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: hasPassword ? currentPassword : undefined,
          newPassword,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.message ?? "Errore. Riprova.");
        return;
      }
      toast.success(
        body?.mode === "set"
          ? "Password impostata."
          : "Password aggiornata.",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Se era "set", ricarica per passare al form di cambio (hasPassword=true)
      if (body?.mode === "set") {
        window.location.reload();
      }
    } catch {
      setErr("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col" style={{ gap: 12 }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 13.5 }}>
          {hasPassword ? "Cambia password" : "Imposta una password"}
        </div>
        <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
          {hasPassword
            ? "Almeno 8 caratteri, con maiuscola, minuscola e un numero."
            : "Così puoi accedere anche senza Google. Almeno 8 caratteri, maiuscola, minuscola e un numero."}
        </p>
      </div>

      {hasPassword && (
        <div>
          <label className="ds-label" htmlFor="current-password">
            Password attuale
          </label>
          <input
            id="current-password"
            type="password"
            className="ds-input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div>
          <label className="ds-label" htmlFor="new-password">
            Nuova password
          </label>
          <input
            id="new-password"
            type="password"
            className="ds-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="ds-label" htmlFor="confirm-password">
            Conferma nuova password
          </label>
          <input
            id="confirm-password"
            type="password"
            className="ds-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
      </div>

      {err && (
        <p style={{ fontSize: 12, color: "var(--red-ds)", margin: 0 }}>{err}</p>
      )}

      <div className="flex items-center justify-between gap-3" style={{ marginTop: 4 }}>
        {hasPassword ? (
          <Link
            href="/forgot-password"
            style={{ fontSize: 12.5, color: "var(--fg-muted)" }}
          >
            Hai dimenticato la password?
          </Link>
        ) : (
          <span />
        )}
        <button type="submit" className="ds-btn ds-btn-accent" disabled={loading}>
          {loading
            ? "Salvo..."
            : hasPassword
              ? "Aggiorna password"
              : "Imposta password"}
        </button>
      </div>
    </form>
  );
}
