"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/design/icon";

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  action: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands: Command[] = [
    { id: "1", label: "Dashboard", hint: "Home", icon: "dashboard", action: () => router.push("/dashboard") },
    { id: "2", label: "Candidature", hint: "Le tue", icon: "briefcase", action: () => router.push("/applications") },
    { id: "3", label: "Job board", hint: "Nuovi annunci", icon: "inbox", action: () => router.push("/jobs") },
    { id: "4", label: "Analisi", hint: "Metriche", icon: "chart", action: () => router.push("/analytics") },
    { id: "5", label: "CV", hint: "Il tuo curriculum", icon: "file", action: () => router.push("/cv") },
    { id: "6", label: "Preferenze", hint: "Cosa cerchi", icon: "target", action: () => router.push("/preferences") },
    { id: "7", label: "Impostazioni", hint: "Account · Billing", icon: "settings", action: () => router.push("/settings") },
    { id: "8", label: "Messaggi", hint: "Recruiter", icon: "inbox", action: () => router.push("/inbox") },
  ];

  const filtered = query
    ? commands.filter((c) =>
        (c.label + " " + c.hint).toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(15,16,18,0.4)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          borderRadius: "var(--radius-lg)",
          width: 540,
          maxWidth: "92vw",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-ds)",
          }}
        >
          <Icon name="search" size={16} style={{ color: "var(--fg-subtle)" }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un'azione..."
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14,
              color: "var(--fg)",
            }}
          />
          <span className="ds-kbd">ESC</span>
        </div>
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "24px 18px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--fg-muted)",
              }}
            >
              Nessun risultato
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  c.action();
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 18px",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--fg)",
                  fontSize: 13.5,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-sunken)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <Icon name={c.icon} size={14} style={{ color: "var(--fg-muted)" }} />
                <span style={{ fontWeight: 500 }}>{c.label}</span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 11.5,
                    color: "var(--fg-subtle)",
                  }}
                >
                  {c.hint}
                </span>
                <Icon
                  name="arrow-right"
                  size={12}
                  style={{ color: "var(--fg-subtle)" }}
                />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
