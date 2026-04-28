"use client";

import useSWR from "swr";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design/icon";
import { NewSearchDialog } from "@/components/new-search-dialog";

interface ApiSession {
  id: string;
  title: string;
  label: string;
  status: "active" | "paused" | "completed" | "cancelled";
  targetCount: number;
  sentCount: number;
  customContext?: string | null;
  totalApplications: number;
  awaitingConsent: number;
  completedAt: string | null;
  completedAcknowledgedAt: string | null;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

/**
 * Widget dashboard: progress bar dei round attivi + prompt
 * "round completato → avviane un altro" per i round chiusi e non
 * ancora acknowledged dall'utente.
 */
export function SessionsStatus() {
  const router = useRouter();
  const { data, mutate } = useSWR<{ sessions: ApiSession[] }>(
    "/api/sessions",
    fetcher,
    { refreshInterval: 30_000 },
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const sessions = data?.sessions ?? [];
  const active = sessions.filter(
    (s) => s.status === "active" || s.status === "paused",
  );
  const justCompleted = sessions.filter(
    (s) => s.status === "completed" && !s.completedAcknowledgedAt,
  );

  async function ack(id: string) {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgeCompleted: true }),
    });
    mutate();
  }

  async function pauseResume(s: ApiSession) {
    const next = s.status === "paused" ? "active" : "paused";
    await fetch(`/api/sessions/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    mutate();
    toast.success(next === "paused" ? "Round in pausa" : "Round ripreso");
  }

  async function cancelRound(s: ApiSession) {
    const ok = window.confirm(
      `Annullare il round "${s.title}"? Le ${s.sentCount} candidature già inviate restano. Nessuna nuova candidatura partirà per questo titolo.`,
    );
    if (!ok) return;
    const res = await fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Errore annullamento round");
      return;
    }
    mutate();
    toast.success("Round annullato");
  }

  if (sessions.length === 0 && justCompleted.length === 0) {
    // Nessuna sessione: mostra solo il CTA
    return (
      <>
        <div
          className="ds-section-card"
          style={{ padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Nessun round attivo
            </div>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2 }}>
              Avvia un round per iniziare a candidarti automaticamente a un
              titolo specifico.
            </div>
          </div>
          <button
            type="button"
            className="ds-btn ds-btn-primary"
            onClick={() => setDialogOpen(true)}
          >
            Nuovo round
          </button>
        </div>
        <NewSearchDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </>
    );
  }

  return (
    <>
      {justCompleted.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {justCompleted.map((s) => (
            <div
              key={s.id}
              style={{
                padding: "14px 18px",
                borderRadius: 10,
                background:
                  "linear-gradient(180deg, hsl(var(--primary)/0.10), hsl(var(--primary)/0.04))",
                border: "1px solid hsl(var(--primary)/0.40)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  🎯 Round completato — &quot;{s.title}&quot;
                </div>
                <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2 }}>
                  {s.sentCount}/{s.targetCount} candidature inviate. Vuoi avviarne
                  un altro?
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="ds-btn ds-btn-sm"
                  onClick={() => ack(s.id)}
                >
                  Chiudi
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn-sm ds-btn-primary"
                  onClick={() => {
                    void ack(s.id);
                    setDialogOpen(true);
                  }}
                >
                  Avvia un nuovo round
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className="ds-section-card"
        style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            Round attivi ({active.length}/3)
          </div>
          {active.length >= 3 ? (
            <button
              type="button"
              className="ds-btn ds-btn-sm"
              onClick={() =>
                toast.info(
                  "Massimo 3 round in parallelo. Annulla o aspetta che uno completi prima di crearne un altro.",
                )
              }
              title="Massimo 3 round in parallelo"
              style={{ opacity: 0.7 }}
            >
              <Icon name="plus" size={11} /> Nuovo (3/3)
            </button>
          ) : (
            <button
              type="button"
              className="ds-btn ds-btn-sm ds-btn-primary"
              onClick={() => setDialogOpen(true)}
            >
              <Icon name="plus" size={11} /> Nuovo
            </button>
          )}
        </div>

        {active.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
            Nessun round attivo. Avviane uno per iniziare l&apos;auto-apply.
          </div>
        )}

        {active.map((s) => {
          const pct = Math.min(
            100,
            Math.round((s.sentCount / Math.max(1, s.targetCount)) * 100),
          );
          return (
            <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {s.title}
                  </div>
                  {s.status === "paused" && (
                    <span
                      className="ds-chip"
                      style={{ fontSize: 10, padding: "2px 6px" }}
                    >
                      in pausa
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                    {s.sentCount} / {s.targetCount}
                  </span>
                  <button
                    type="button"
                    className="ds-btn ds-btn-sm"
                    onClick={() => pauseResume(s)}
                    style={{ fontSize: 11, padding: "3px 9px" }}
                  >
                    {s.status === "paused" ? "Riprendi" : "Pausa"}
                  </button>
                  <button
                    type="button"
                    aria-label="Annulla round"
                    title="Annulla round"
                    onClick={() => cancelRound(s)}
                    style={{
                      width: 24,
                      height: 24,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 6,
                      border: "1px solid var(--border-ds)",
                      background: "transparent",
                      color: "var(--fg-muted)",
                      cursor: "pointer",
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 999,
                  background: "var(--bg-sunken)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background:
                      s.status === "paused"
                        ? "var(--fg-subtle)"
                        : "var(--primary-ds)",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <NewSearchDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          // small delay so backend has time to commit before refetch
          setTimeout(() => {
            mutate();
            router.refresh();
          }, 300);
        }}
      />
    </>
  );
}
