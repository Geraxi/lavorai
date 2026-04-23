"use client";

import { useEffect } from "react";
import { Icon } from "@/components/design/icon";

/**
 * Modal di conferma brandizzato (sostituisce window.confirm).
 * Coerente coi token LavorAI: border-ds, fg, bg, accent green.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger" | "accent";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  variant = "accent",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "ds-btn ds-btn-primary"
      : variant === "primary"
        ? "ds-btn ds-btn-primary"
        : "ds-btn ds-btn-accent";

  return (
    <>
      <div
        onClick={onCancel}
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
            width: "100%",
            maxWidth: 440,
            background: "var(--bg)",
            border: "1px solid var(--border-ds)",
            borderRadius: 12,
            boxShadow: "0 20px 60px rgba(0,0,0,.35)",
            pointerEvents: "auto",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "22px 22px 6px" }}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              {title}
            </h2>
            {message ? (
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--fg-muted)",
                  marginTop: 8,
                  marginBottom: 0,
                  lineHeight: 1.55,
                }}
              >
                {message}
              </p>
            ) : null}
          </div>
          <div
            style={{
              padding: "14px 22px 18px",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              borderTop: "1px solid var(--border-ds)",
              marginTop: 16,
              background: "var(--bg-sunken)",
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              className="ds-btn ds-btn-ghost"
              style={{ fontSize: 13 }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={confirmClass}
              style={{ fontSize: 13 }}
              autoFocus
            >
              <Icon name="check" size={12} /> {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
