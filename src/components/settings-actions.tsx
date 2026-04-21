"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";
import type { Tier } from "@/lib/billing";

export function SubscriptionActions({
  tier,
  hasStripe,
}: {
  tier: Tier;
  hasStripe: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function upgrade(target: "pro" | "pro_plus") {
    setLoading(target);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: target }),
      });
      const body = await res.json().catch(() => ({}));
      if (body?.url) {
        window.location.href = body.url;
        return;
      }
      toast.error(body?.message ?? "Checkout non disponibile. Contatta il supporto.");
    } finally {
      setLoading(null);
    }
  }

  async function portal() {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (body?.url) {
        window.location.href = body.url;
        return;
      }
      toast.error(body?.message ?? "Portale non disponibile.");
    } finally {
      setLoading(null);
    }
  }

  if (hasStripe) {
    return (
      <button
        type="button"
        className="ds-btn"
        onClick={portal}
        disabled={loading === "portal"}
      >
        {loading === "portal" ? (
          <>
            <Icon name="refresh" size={12} /> Apro portale...
          </>
        ) : (
          <>Gestisci piano</>
        )}
      </button>
    );
  }

  if (tier === "free") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          className="ds-btn"
          onClick={() => upgrade("pro")}
          disabled={loading === "pro"}
        >
          {loading === "pro" ? "..." : "Passa a Pro"}
        </button>
        <button
          type="button"
          className="ds-btn ds-btn-accent"
          onClick={() => upgrade("pro_plus")}
          disabled={loading === "pro_plus"}
        >
          {loading === "pro_plus" ? "..." : "Passa a Pro+"}
        </button>
      </div>
    );
  }

  if (tier === "pro") {
    return (
      <button
        type="button"
        className="ds-btn ds-btn-accent"
        onClick={() => upgrade("pro_plus")}
        disabled={loading === "pro_plus"}
      >
        {loading === "pro_plus" ? "..." : "Upgrade a Pro+"}
      </button>
    );
  }

  return null;
}

export function GdprExportButton() {
  return (
    <a
      href="/api/gdpr/export"
      className="ds-btn"
      download
    >
      <Icon name="download" size={13} /> Esporta i miei dati (JSON)
    </a>
  );
}

export function DeleteAccountButton({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete() {
    if (confirm !== "ELIMINA") {
      setErr("Scrivi ELIMINA per confermare.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: "ELIMINA",
          password: hasPassword ? password : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.message ?? "Errore. Riprova.");
        return;
      }
      toast.success("Account eliminato. A presto.");
      // Forza logout + redirect
      await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
      window.location.href = "/";
    } catch {
      setErr("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="ds-btn"
        style={{ color: "var(--red-ds)", borderColor: "var(--red-ds)" }}
        onClick={() => setOpen(true)}
      >
        Cancella account
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,16,18,0.55)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(4px)",
      }}
      onClick={() => !loading && setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: 460,
          padding: 32,
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            margin: "0 0 10px",
          }}
        >
          Elimina account definitivamente
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--fg-muted)",
            lineHeight: 1.5,
            margin: "0 0 18px",
          }}
        >
          Verrai disconnesso e tutti i tuoi dati (CV, candidature, preferenze,
          sessioni portali) verranno cancellati.{" "}
          <strong style={{ color: "var(--fg)" }}>Questa azione è irreversibile.</strong>
        </p>

        {hasPassword && (
          <>
            <label className="ds-label">Password</label>
            <input
              type="password"
              className="ds-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="La tua password attuale"
              autoComplete="current-password"
              style={{ marginBottom: 12 }}
            />
          </>
        )}

        <label className="ds-label">
          Scrivi <span className="mono">ELIMINA</span> per confermare
        </label>
        <input
          type="text"
          className="ds-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="ELIMINA"
          autoComplete="off"
        />

        {err && (
          <p style={{ fontSize: 12, color: "var(--red-ds)", marginTop: 10 }}>
            {err}
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 20,
          }}
        >
          <button
            type="button"
            className="ds-btn"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Annulla
          </button>
          <button
            type="button"
            className="ds-btn"
            style={{
              background: "var(--red-ds)",
              color: "#fff",
              borderColor: "var(--red-ds)",
            }}
            onClick={onDelete}
            disabled={loading || confirm !== "ELIMINA"}
          >
            {loading ? "Elimino..." : "Elimina definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}
