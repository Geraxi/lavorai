"use client";

import { useState } from "react";
import useSWR from "swr";

interface ActivePopup {
  id: string;
  title: string;
  body: string;
  kind: "rating" | "feedback" | "improvement" | "info";
  ctaLabel: string | null;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

/**
 * Mostra all'utente il popup attivo creato dall'admin (sondaggi, feedback,
 * proposte di miglioramento). Fetcha dopo il primo paint via SWR; una volta
 * risposto/dismissato non riappare (gestito server-side per (popup,user)).
 */
export function UserPopup() {
  const { data, mutate } = useSWR<{ popup: ActivePopup | null }>(
    "/api/popups/active",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000 },
  );
  const popup = data?.popup ?? null;

  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!popup) return null;

  const defaultCta =
    popup.kind === "rating"
      ? "Invia valutazione"
      : popup.kind === "info"
        ? "Ho capito"
        : "Invia";
  const cta = popup.ctaLabel || defaultCta;
  const needsText = popup.kind === "feedback" || popup.kind === "improvement";
  const placeholder =
    popup.kind === "improvement"
      ? "Cosa miglioreresti? La tua proposta…"
      : "Scrivi qui il tuo feedback…";

  async function send(dismissed: boolean) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/popups/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          popupId: popup!.id,
          rating: rating || undefined,
          text: text || undefined,
          dismissed,
        }),
      });
      if (dismissed) {
        // chiudi subito e cerca il prossimo
        mutate();
      } else {
        setDone(true);
        setTimeout(() => mutate(), 1400);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    popup.kind === "info" ||
    (popup.kind === "rating" ? rating > 0 : text.trim().length > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={popup.title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 16,
        background: "rgba(10,11,13,0.45)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        animation: "lavorai-popup-fade 0.2s ease",
      }}
      onClick={() => !submitting && send(true)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          marginBottom: "min(8vh, 64px)",
          borderRadius: 16,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.2), 0 18px 50px rgba(0,0,0,0.45)",
          padding: 22,
          animation: "lavorai-popup-rise 0.28s cubic-bezier(0.2,0.8,0.3,1)",
        }}
      >
        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🙏</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Grazie!</div>
            <div
              style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 4 }}
            >
              Il tuo feedback ci aiuta a migliorare LavorAI.
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: 6,
              }}
            >
              LavorAI
            </div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              {popup.title}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--fg-muted)",
                lineHeight: 1.6,
                margin: "8px 0 16px",
                whiteSpace: "pre-wrap",
              }}
            >
              {popup.body}
            </p>

            {popup.kind === "rating" && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "center",
                  marginBottom: 14,
                }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} stelle`}
                    onClick={() => setRating(n)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 30,
                      lineHeight: 1,
                      filter: n <= rating ? "none" : "grayscale(1)",
                      opacity: n <= rating ? 1 : 0.4,
                      transition: "transform 0.1s, opacity 0.1s",
                    }}
                  >
                    ⭐
                  </button>
                ))}
              </div>
            )}

            {(needsText || (popup.kind === "rating" && rating > 0)) && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  popup.kind === "rating"
                    ? "Vuoi aggiungere un commento? (opzionale)"
                    : placeholder
                }
                rows={4}
                style={{
                  width: "100%",
                  resize: "vertical",
                  borderRadius: 10,
                  border: "1px solid var(--border-ds)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  marginBottom: 14,
                }}
              />
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => send(true)}
                disabled={submitting}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--border-ds)",
                  background: "transparent",
                  color: "var(--fg-muted)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Più tardi
              </button>
              <button
                type="button"
                onClick={() => send(false)}
                disabled={submitting || !canSubmit}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: "hsl(var(--primary))",
                  color: "#001a0d",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  opacity: canSubmit ? 1 : 0.5,
                }}
              >
                {submitting ? "Invio…" : cta}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes lavorai-popup-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes lavorai-popup-rise {
          from { transform: translateY(16px); opacity: 0 }
          to { transform: translateY(0); opacity: 1 }
        }
      `}</style>
    </div>
  );
}
