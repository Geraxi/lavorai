"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";
import { TIERS, type Tier } from "@/lib/billing";

/**
 * Paywall reusable:
 * - `variant="signup"`: mostrato subito dopo creazione account (prima del verify email).
 *   Clic su Pro/Pro+ salva `lavorai.selectedPlan` in localStorage → al primo login
 *   l'utente viene portato a Stripe Checkout (vedi PostLoginCheckout).
 * - `variant="limit"`: utente loggato ha superato il limite free. Pro/Pro+ chiama
 *   direttamente /api/stripe/checkout.
 */

type Variant = "signup" | "limit";

interface PaywallDialogProps {
  open: boolean;
  onClose: () => void;
  variant: Variant;
  /** Messaggio da mostrare in cima — default "Scegli il piano" */
  headline?: string;
  /** Sottotitolo opzionale */
  sub?: string;
}

export function PaywallDialog({
  open,
  onClose,
  variant,
  headline,
  sub,
}: PaywallDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const tiers = [TIERS.free, TIERS.pro, TIERS.pro_plus];
  const defaultHeadline =
    variant === "limit" ? "Hai raggiunto il limite Free" : "Scegli il tuo piano";
  const defaultSub =
    variant === "limit"
      ? "Passa a Pro per continuare a candidarti automaticamente."
      : "Puoi iniziare gratis e passare a Pro quando vuoi.";

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          zIndex: 60,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          zIndex: 61,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 920,
            background: "var(--bg)",
            border: "1px solid var(--border-ds)",
            borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,.35)",
            pointerEvents: "auto",
            maxHeight: "90vh",
            overflow: "auto",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "24px 28px 12px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.022em",
                  margin: 0,
                }}
              >
                {headline ?? defaultHeadline}
              </h2>
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--fg-muted)",
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                {sub ?? defaultSub}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ds-btn ds-btn-sm ds-btn-ghost"
              aria-label="Chiudi"
            >
              <Icon name="x" size={14} />
            </button>
          </div>

          {/* Tiers grid */}
          <div
            style={{
              padding: "8px 28px 24px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {tiers.map((t) => (
              <TierCard
                key={t.id}
                tier={t.id}
                variant={variant}
                onClose={onClose}
              />
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "14px 28px 24px",
              borderTop: "1px solid var(--border-ds)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
              Nessuna carta richiesta per il piano Free · Cancella quando vuoi
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ds-btn ds-btn-ghost"
              style={{ fontSize: 13 }}
            >
              {variant === "limit" ? "Chiudi" : "Continua gratis"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function TierCard({
  tier,
  variant,
  onClose,
}: {
  tier: Tier;
  variant: Variant;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const cfg = TIERS[tier];
  const isFree = tier === "free";
  const isHighlighted = tier === "pro";

  async function onSelect() {
    if (isFree) {
      onClose();
      return;
    }
    if (variant === "signup") {
      // L'utente non è ancora loggato: salviamo l'intent e dopo il verify
      // email + login lo reindirizziamo a Stripe.
      try {
        localStorage.setItem("lavorai.selectedPlan", tier);
      } catch {
        // storage bloccato (private mode) — fallback: query param al login
      }
      toast.success(
        "Perfetto! Verifica l'email e ti porteremo al checkout al primo login.",
      );
      onClose();
      return;
    }
    // variant === "limit": utente loggato → Stripe subito
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) {
        toast.error(body?.message ?? "Checkout non disponibile.");
        return;
      }
      window.location.href = body.url;
    } catch {
      toast.error("Errore di rete.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        border: isHighlighted
          ? "2px solid var(--primary-ds)"
          : "1px solid var(--border-ds)",
        borderRadius: 12,
        padding: 18,
        background: "var(--bg-elev)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {isHighlighted && (
        <div
          style={{
            position: "absolute",
            top: -10,
            left: 16,
            background: "var(--primary-ds)",
            color: "white",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.6,
            padding: "3px 8px",
            borderRadius: 4,
            textTransform: "uppercase",
          }}
        >
          Consigliato
        </div>
      )}
      <div
        style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--fg-muted)" }}
      >
        {cfg.name}
      </div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {cfg.priceDisplay}
        </span>
        {cfg.priceSuffix ? (
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            {cfg.priceSuffix}
          </span>
        ) : null}
      </div>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--fg-muted)",
          marginTop: 6,
          minHeight: 32,
        }}
      >
        {cfg.tagline}
      </p>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "12px 0 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 12.5,
          color: "var(--fg)",
          flex: 1,
        }}
      >
        {cfg.features.slice(0, 5).map((f, i) => (
          <li key={i} style={{ display: "flex", gap: 8, lineHeight: 1.4 }}>
            <Icon
              name="check"
              size={12}
              style={{ color: "var(--primary-ds)", flexShrink: 0, marginTop: 3 }}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onSelect}
        disabled={loading}
        className={`ds-btn ${isHighlighted ? "ds-btn-accent" : isFree ? "ds-btn-ghost" : "ds-btn-primary"}`}
        style={{ width: "100%", fontSize: 13 }}
      >
        {loading ? (
          <>
            <Icon name="refresh" size={12} /> Apro checkout…
          </>
        ) : isFree ? (
          "Continua gratis"
        ) : (
          cfg.cta
        )}
      </button>
    </div>
  );
}
