"use client";

import { useState } from "react";
import { Icon } from "@/components/design/icon";

/**
 * Modale/card per collegare Gmail all'account LavorAI esistente.
 * Mostrato quando l'utente clicca "Collega Gmail" dalla Inbox e non ha ancora
 * un account Google linkato.
 *
 * La modale spiega perché abbiamo bisogno di gmail.readonly, rassicura sulla
 * privacy, e avvia l'OAuth Google al click su "Autorizza Gmail".
 */
export function GmailConnectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleConnect = () => {
    setLoading(true);
    // Navighiamo a /api/gmail/connect, che controllerà la sessione e
    // reindirizza a Google OAuth. Al ritorno, l'account sarà linkato.
    window.location.href = "/api/gmail/connect";
  };

  return (
    <>
      {/* Overlay scuro */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        {/* Card modale */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--bg-elev)",
            borderRadius: 12,
            border: "1px solid var(--border-ds)",
            maxWidth: 520,
            width: "100%",
            padding: "24px 28px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "hsl(var(--primary)/0.12)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name="inbox" size={18} />
              </div>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  margin: 0,
                }}
              >
                Collega Gmail
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--fg-subtle)",
              }}
              aria-label="Chiudi"
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          {/* Corpo */}
          <div style={{ marginBottom: 20 }}>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--fg)",
                margin: "0 0 14px",
              }}
            >
              Per mostrarti le risposte dei recruiter direttamente nella tua
              Inbox, LavorAI ha bisogno di accedere alla tua Gmail in
              <strong> sola lettura</strong>.
            </p>
            <ul
              style={{
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "var(--fg-muted)",
                paddingLeft: 20,
                margin: "0 0 14px",
              }}
            >
              <li>
                <strong>Privacy garantita:</strong> leggiamo solo le email che
                riguardano le tue candidature.
              </li>
              <li>
                <strong>Nessuna modifica:</strong> LavorAI non può cancellare,
                spostare o inviare email dal tuo account.
              </li>
              <li>
                <strong>Revoca quando vuoi:</strong> puoi scollegare Gmail in
                qualsiasi momento dalle impostazioni.
              </li>
            </ul>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--bg-sunken)",
                border: "1px solid var(--border-ds)",
                fontSize: 12.5,
                color: "var(--fg-muted)",
                lineHeight: 1.5,
              }}
            >
              Autorizzerai LavorAI tramite Google OAuth. I tuoi dati Gmail non
              vengono mai memorizzati sul nostro server.
            </div>
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 8,
                background: "hsl(var(--primary)/0.08)",
                border: "1px solid hsl(var(--primary)/0.25)",
                fontSize: 12.5,
                color: "var(--fg)",
                lineHeight: 1.5,
              }}
            >
              <strong>Nota:</strong> L&apos;account Gmail che colleghi deve avere
              la stessa email del tuo account LavorAI. Se usi un&apos;email
              Google diversa, resterai connesso con il tuo account attuale.
            </div>
          </div>

          {/* Footer bottoni */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="ds-btn ds-btn-sm"
              style={{ padding: "8px 16px" }}
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleConnect}
              disabled={loading}
              className="ds-btn ds-btn-primary ds-btn-sm"
              style={{
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <GoogleIcon />
              {loading ? "Reindirizzamento…" : "Autorizza Gmail"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}
