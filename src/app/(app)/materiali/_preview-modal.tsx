"use client";

import { useEffect, useState } from "react";

/**
 * Modal-preview PDF per card /materiali. L'utente clicca "Anteprima"
 * → si apre un overlay full-screen con l'iframe che carica il PDF via
 * ?disposition=inline (endpoint restituisce Content-Disposition:inline
 * così il browser lo renderizza invece di scaricarlo).
 *
 * Wrapper: emette un evento globale `lavorai:preview-cv` che il bottone
 * di ogni card triggera. Un solo modal in pagina, senza props drilling.
 */
export function CvPreviewModal() {
  const [state, setState] = useState<{ id: string; title: string } | null>(
    null,
  );

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as {
        id: string;
        title: string;
      };
      if (detail?.id) setState(detail);
    }
    window.addEventListener("lavorai:preview-cv", onOpen);
    return () => window.removeEventListener("lavorai:preview-cv", onOpen);
  }, []);

  useEffect(() => {
    // ESC per chiudere
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setState(null);
    }
    if (state) {
      window.addEventListener("keydown", onKey);
      // Blocca scroll body dietro il modal
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [state]);

  if (!state) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Anteprima CV per ${state.title}`}
      onClick={() => setState(null)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(1,5,16,0.86)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1000px, 95vw)",
          height: "min(1200px, 92vh)",
          background: "#fff",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "#f8fafc",
            color: "#0f172a",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {state.title}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <a
              href={`/api/applications/${state.id}/document?kind=pdf`}
              download
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                background: "#16a34a",
                color: "#fff",
                textDecoration: "none",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              Scarica PDF
            </a>
            <button
              type="button"
              onClick={() => setState(null)}
              aria-label="Chiudi"
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                background: "transparent",
                border: "1px solid #cbd5e1",
                color: "#334155",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              ✕ Chiudi
            </button>
          </div>
        </div>
        {/* PDF iframe */}
        <iframe
          src={`/api/applications/${state.id}/document?kind=pdf&disposition=inline`}
          title={`CV per ${state.title}`}
          style={{ flex: 1, width: "100%", border: 0 }}
        />
      </div>
    </div>
  );
}

/**
 * Bottone client che triggera l'apertura del modal di preview.
 * Sostituisce il bottone "CV PDF" download-only con un'anteprima
 * inline + fallback download nel modal header.
 */
export function CvPreviewButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("lavorai:preview-cv", { detail: { id, title } }),
        );
      }}
      className="ds-btn ds-btn-sm"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        cursor: "pointer",
      }}
      title="Anteprima CV nel browser"
    >
      👁 Anteprima
    </button>
  );
}
