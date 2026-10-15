"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";

/**
 * "Nuova ricerca" — crea un nuovo round di candidature per un job title
 * specifico. Massimo 3 round in parallelo (vincolo server).
 */

const SUGGESTIONS = [
  "Senior Product Designer",
  "Product Designer",
  "Front-End Developer",
  "Full-Stack Developer",
  "Back-End Engineer",
  "Product Manager",
  "Senior Product Manager",
  "Data Engineer",
  "DevOps Engineer",
  "UX Designer",
  "Marketing Manager",
  "Sales Manager",
];

const TARGET_PRESETS = [10, 30, 50, 100];

export function NewSearchDialog({
  open,
  onClose,
  locale = "it",
}: {
  open: boolean;
  locale?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const tr = (it: string, en: string) => locale === "en" ? en : it;
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState<number>(30);
  const [customContext, setCustomContext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    const t = title.trim();
    if (t.length < 2) {
      toast.error(tr("Inserisci un titolo del ruolo", "Enter a role title"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          targetCount: target,
          customContext: customContext.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.message ?? tr("Errore creazione round", "Unable to create search round"));
        return;
      }
      toast.success(locale === "en" ? `Round "${t}" started — target ${target}` : `Round "${t}" avviato — target ${target}`);
      setTitle("");
      setCustomContext("");
      setTarget(30);
      onClose();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          zIndex: 70,
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
          zIndex: 71,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border-ds)",
            borderRadius: 16,
            width: "100%",
            maxWidth: 540,
            padding: 28,
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.5)",
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
              {tr("Avvia un nuovo round", "Start a new round")}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--fg-muted)",
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              {tr("Un round = N candidature mirate ad un titolo specifico. A target raggiunto, ti chiediamo sulla dashboard se avviarne un altro. Massimo 3 round attivi in parallelo.", "A round groups applications for a specific role. Once its target is reached, the dashboard asks whether to start another. Up to 3 rounds can be active at once.")}
            </div>
          </div>

          <div>
            <label className="ds-label">{tr("Titolo del ruolo", "Role title")}</label>
            <input
              ref={inputRef}
              className="ds-input"
              placeholder={tr("es. Senior Product Designer", "e.g. Senior Product Designer")}
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              {SUGGESTIONS.slice(0, 8).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTitle(s)}
                  style={{
                    fontSize: 11.5,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--border-ds)",
                    background: "transparent",
                    color: "var(--fg-muted)",
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="ds-label">{tr("Target candidature", "Application target")}</label>
            <div className="ds-toggle-group" style={{ display: "flex", width: "100%" }}>
              {TARGET_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === target ? "active" : undefined}
                  style={{ flex: 1 }}
                  onClick={() => setTarget(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="ds-label">
              {tr("Contesto extra per questo round", "Extra context for this round")}{" "}
              <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
                {tr("(opzionale)", "(optional)")}
              </span>
            </label>
            <textarea
              className="ds-input"
              rows={3}
              maxLength={2000}
              placeholder={tr("Esperienze o progetti specifici da valorizzare nel CV per questo round (es. side project, freelance, certificazioni). L'AI lo integra naturalmente nel CV ottimizzato per ogni candidatura.", "Relevant experience, projects or certifications to highlight in the tailored CV for this round.")}
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
            />
            <p style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 4 }}>
              {tr("Se non hai un CV alternativo per questo tipo di ruolo, scrivi qui le esperienze specifiche che vuoi far emergere.", "If you do not have an alternative CV for this role, describe the relevant experience you want to highlight.")}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              className="ds-btn"
              onClick={onClose}
              disabled={submitting}
            >
              {tr("Annulla", "Cancel")}
            </button>
            <button
              type="button"
              className="ds-btn ds-btn-primary"
              onClick={submit}
              disabled={submitting || title.trim().length < 2}
              style={{ minHeight: 40 }}
            >
              {submitting ? tr("Avvio...", "Starting…") : tr("Avvia round", "Start round")}
              {!submitting && <Icon name="zap" size={13} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
