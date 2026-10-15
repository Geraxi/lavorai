"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";

type Mode = "off" | "manual" | "hybrid" | "auto";
type ApplicationService = {
  automaticBlocked: boolean;
  submissionsPaused: boolean;
  dailyCap: number | null;
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function AutoApplyToggle({ compact = false, locale = "it" }: { compact?: boolean; locale?: string } = {}) {
  const en = locale === "en";
  const tr = (it: string, english: string) => en ? english : it;
  const { data, mutate } = useSWR<{ autoApplyMode: Mode; applicationService?: ApplicationService }>(
    "/api/preferences",
    fetcher,
  );
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mode = (data?.autoApplyMode ?? "manual") as Mode;
  const service = data?.applicationService;
  // Missing service metadata must never advertise an active automatic sender.
  const automaticBlocked = service?.automaticBlocked !== false;
  const submissionsPaused = service?.submissionsPaused !== false;
  const controlsDisabled = automaticBlocked || submissionsPaused;
  const serviceLabel = !service ? tr("Stato invii non disponibile", "Submission status unavailable")
    : submissionsPaused ? tr("Invii in pausa", "Submissions paused")
      : automaticBlocked ? tr("Solo candidature confermate", "Confirmed applications only") : null;
  const serviceDetail = !service ? tr("In attesa dello stato del servizio.", "Waiting for service status.")
    : submissionsPaused ? tr("Gli invii sono temporaneamente sospesi. Le preferenze restano salvate.", "Submissions are temporarily paused. Your preferences are saved.")
      : automaticBlocked ? tr(`Invio automatico sospeso. Solo nuove candidature confermate; limite complessivo ${service.dailyCap} al giorno (UTC). Le preferenze restano salvate.`, `Automatic submissions paused. New confirmed applications only; global limit ${service.dailyCap} per day (UTC). Your preferences are saved.`)
        : undefined;

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
    if (controlsDisabled || nextMode === mode) return;
    setBusy(true);
    try {
      const res = await fetch("/api/preferences/mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoApplyMode: nextMode }),
      });
      if (!res.ok) {
        toast.error(tr("Impossibile aggiornare l'auto-apply", "Unable to update auto-apply"));
        return;
      }
      toast.success(
        nextMode === "off"
          ? tr("Auto-apply in pausa", "Auto-apply paused")
          : nextMode === "hybrid"
            ? tr("Modalità: Approva prima", "Mode: Approve first")
            : tr("Modalità: 100% Automatica", "Mode: Fully automatic"),
      );
      mutate();
    } catch {
      toast.error(tr("Errore di rete", "Network error"));
    } finally {
      setBusy(false);
    }
  }

  const options = [
    { value: "auto", label: tr("Auto-apply (100% automatico)", "Auto-apply (automatic)"), icon: "zap" },
    { value: "hybrid", label: tr("Review (Richiede approvazione)", "Review (approval required)"), icon: "eye" },
    { value: "off", label: tr("In pausa", "Paused"), icon: "pause-circle" },
  ];

  const currentOption = options.find((o) => o.value === mode) || options[0];

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...(compact ? { width: "100%", minWidth: 0 } : {}) }}>
      <button
        type="button"
        className="ds-btn ds-btn-ghost"
        onClick={() => { if (!controlsDisabled) setOpen(!open); }}
        disabled={busy || !data || controlsDisabled}
        title={serviceDetail}
        aria-label={serviceLabel ? `${serviceLabel}. ${serviceDetail}` : undefined}
        style={{
          background: "var(--bg-sunken)",
          borderColor: "var(--border-ds)",
          color: submissionsPaused || mode === "off" ? "var(--fg-muted)" : "var(--primary-ds)",
          fontWeight: mode !== "off" ? 600 : 400,
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: compact ? 0 : 150,
          width: compact ? "100%" : undefined,
          whiteSpace: compact ? "normal" : undefined,
          textAlign: "left",
          lineHeight: 1.4,
          justifyContent: "space-between",
          padding: "6px 10px 6px 12px",
          height: compact ? "auto" : 32,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {busy ? (
            <Icon name="refresh" size={14} className="animate-spin" />
          ) : (
            <Icon name={(serviceLabel ? submissionsPaused ? "pause-circle" : "eye" : currentOption.icon) as any} size={14} />
          )}
          {serviceLabel ?? currentOption.label.split(" (")[0]}
        </span>
        {!controlsDisabled && <Icon
          name="chevron-down"
          size={14}
          style={{
            color: "var(--fg-subtle)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        />}
      </button>

      {open && !controlsDisabled && (
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
