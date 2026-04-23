"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Icon } from "@/components/design/icon";

/**
 * "Nuova ricerca" — lascia all'utente scegliere un nuovo ruolo / settore.
 * Un ruolo nuovo (diverso dai ruoli delle sessioni esistenti) = nuova sessione
 * di candidatura. Routa su /jobs?what=<ruolo> così il job board filtra subito.
 */

interface ApiSession {
  id: string;
  label: string;
  status: "auto" | "paused";
  total: number;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const SUGGESTIONS = [
  "Front-End Developer",
  "Back-End Developer",
  "Full-Stack Developer",
  "Product Designer",
  "UX Designer",
  "Data Scientist",
  "Data Engineer",
  "DevOps Engineer",
  "Product Manager",
  "Marketing Manager",
  "Sales Manager",
  "Account Executive",
  "Customer Success",
  "HR Specialist",
];

export function NewSearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data } = useSWR<{ sessions: ApiSession[] }>(
    open ? "/api/sessions" : null,
    fetcher,
  );
  const [value, setValue] = useState("");
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

  const sessions = data?.sessions ?? [];

  function goTo(role: string) {
    const trimmed = role.trim();
    if (!trimmed) return;
    onClose();
    router.push(`/jobs?what=${encodeURIComponent(trimmed)}`);
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
            width: "100%",
            maxWidth: 540,
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
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: "-0.015em",
                margin: 0,
              }}
            >
              Avvia una nuova ricerca
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--fg-muted)",
                marginTop: 6,
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              Scegli un nuovo ruolo o settore: crea automaticamente una sessione
              di candidatura separata, gestibile in modo indipendente da
              Preferenze.
            </p>
          </div>

          <div style={{ padding: "14px 22px 6px" }}>
            <label className="ds-label">Ruolo / posizione</label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                goTo(value);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                className="ds-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="es. Senior React Developer"
                style={{
                  flex: 1,
                  fontSize: 13.5,
                  padding: "9px 12px",
                }}
              />
              <button
                type="submit"
                className="ds-btn ds-btn-accent"
                disabled={!value.trim()}
                style={{ fontSize: 13 }}
              >
                Cerca <Icon name="arrow-right" size={12} />
              </button>
            </form>
            <div
              style={{
                marginTop: 14,
                fontSize: 11.5,
                color: "var(--fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: 0.8,
                fontWeight: 500,
              }}
            >
              Suggeriti
            </div>
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ds-chip"
                  onClick={() => goTo(s)}
                  style={{
                    padding: "5px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    background: "var(--bg-elev)",
                    border: "1px solid var(--border-ds)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {sessions.length > 0 && (
            <div style={{ padding: "18px 22px 4px" }}>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--fg-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                Continua su una sessione esistente
              </div>
              <div className="flex flex-col" style={{ gap: 6 }}>
                {sessions.slice(0, 4).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(s.label.split("·").pop()?.trim() || s.label)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border-ds)",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{s.label}</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--fg-muted)",
                      }}
                    >
                      {s.total} candidature ·{" "}
                      {s.status === "auto" ? "attiva" : "in pausa"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              padding: "16px 22px 20px",
              marginTop: 18,
              borderTop: "1px solid var(--border-ds)",
              background: "var(--bg-sunken)",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="ds-btn ds-btn-ghost"
              style={{ fontSize: 13 }}
            >
              Annulla
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
