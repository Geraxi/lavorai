"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";

type Mode = "off" | "manual" | "hybrid" | "auto";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function AutoApplyToggle() {
  const { data, mutate } = useSWR<{ autoApplyMode: Mode }>(
    "/api/preferences",
    fetcher,
  );
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mode = (data?.autoApplyMode ?? "manual") as Mode;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function changeMode(nextMode: Mode) {
    setOpen(false);
    if (nextMode === mode) return;
    setBusy(true);
    try {
      const res = await fetch("/api/preferences/mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoApplyMode: nextMode }),
      });
      if (!res.ok) {
        toast.error("Impossibile aggiornare l'auto-apply");
        return;
      }
      toast.success(
        nextMode === "off"
          ? "Auto-apply in pausa"
          : nextMode === "hybrid"
            ? "Modalità: Approva prima"
            : "Modalità: 100% Automatica",
      );
      mutate();
    } catch {
      toast.error("Errore di rete");
    } finally {
      setBusy(false);
    }
  }

  const options = [
    { value: "auto", label: "Auto-apply (100% automatico)", icon: "zap" },
    { value: "hybrid", label: "Review (Richiede approvazione)", icon: "eye" },
    { value: "off", label: "In pausa", icon: "pause-circle" },
  ];

  const currentOption = options.find((o) => o.value === mode) || options[0];

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="ds-btn ds-btn-ghost"
        onClick={() => setOpen(!open)}
        disabled={busy || !data}
        style={{
          background: "var(--bg-sunken)",
          borderColor: "var(--border-ds)",
          color: mode === "off" ? "var(--fg-muted)" : "var(--primary-ds)",
          fontWeight: mode !== "off" ? 600 : 400,
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 150,
          justifyContent: "space-between",
          padding: "6px 10px 6px 12px",
          height: 32,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {busy ? (
            <Icon name="refresh" size={14} className="animate-spin" />
          ) : (
            <Icon name={currentOption.icon as any} size={14} />
          )}
          {currentOption.label.split(" (")[0]}
        </span>
        <Icon
          name="chevron-down"
          size={14}
          style={{
            color: "var(--fg-subtle)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        />
      </button>

      {open && (
        <div
          className="ds-glass"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 260,
            padding: 6,
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            background: "rgba(1, 5, 16, 0.7)",
            border: "1px solid var(--border-ds)",
            borderRadius: 14,
            boxShadow: "0 12px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => changeMode(opt.value as Mode)}
              className="hover:bg-[var(--bg-sunken)]"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 10px",
                borderRadius: 8,
                background: mode === opt.value ? "var(--bg-elev)" : "transparent",
                border: mode === opt.value ? "1px solid var(--border-ds)" : "1px solid transparent",
                cursor: "pointer",
                textAlign: "left",
                color: mode === opt.value ? "var(--fg)" : "var(--fg-muted)",
                transition: "all 0.15s",
              }}
            >
              <Icon
                name={opt.icon as any}
                size={16}
                style={{
                  color: mode === opt.value ? "var(--primary-ds)" : "var(--fg-subtle)",
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {opt.label.split(" (")[0]}
                </div>
                {opt.label.includes("(") && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--fg-subtle)",
                      marginTop: 2,
                      lineHeight: 1.3,
                    }}
                  >
                    {opt.label.split("(")[1].replace(")", "")}
                  </div>
                )}
              </div>
              {mode === opt.value && (
                <Icon name="check" size={14} style={{ color: "var(--primary-ds)" }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
