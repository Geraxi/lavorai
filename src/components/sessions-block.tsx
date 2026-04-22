"use client";

import useSWR from "swr";
import { toast } from "sonner";
import { useState } from "react";
import { Icon } from "@/components/design/icon";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";

interface ApiSession {
  id: string;
  label: string;
  key: string;
  status: "auto" | "paused";
  total: number;
  awaitingConsent: number;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function SessionsBlock() {
  const { data, mutate } = useSWR<{ sessions: ApiSession[] }>(
    "/api/sessions",
    fetcher,
  );
  const sessions = data?.sessions ?? [];
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(s: ApiSession) {
    const next = s.status === "auto" ? "paused" : "auto";
    setBusy(s.id);
    try {
      const res = await fetch(`/api/sessions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        toast.error("Errore aggiornamento sessione");
        return;
      }
      toast.success(
        next === "paused"
          ? `Sessione "${s.label}" in pausa`
          : `Sessione "${s.label}" riattivata`,
      );
      mutate();
    } catch {
      toast.error("Errore di rete");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SectionCard>
      <SectionHead
        icon={<Icon name="target" size={14} />}
        title={`Sessioni di candidatura (${sessions.length})`}
      />
      <SectionBody>
        <p
          style={{
            fontSize: 12,
            color: "var(--fg-muted)",
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          Ogni volta che ti candidi a un ruolo in un settore nuovo, LavorAI crea
          una sessione. Le candidature della stessa sessione partono in
          automatico. Metti in pausa una sessione per bloccare i nuovi invii
          (andranno in attesa di consenso).
        </p>
        {sessions.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              fontSize: 13,
              color: "var(--fg-muted)",
            }}
          >
            Nessuna sessione ancora. Candidati a un job per crearne una.
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 8 }}>
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3"
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border-ds)",
                  borderRadius: 8,
                  background:
                    s.status === "paused"
                      ? "var(--bg-sunken)"
                      : "var(--bg)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--fg-muted)",
                      marginTop: 2,
                    }}
                  >
                    {s.total} {s.total === 1 ? "candidatura" : "candidature"}
                    {s.awaitingConsent > 0 ? (
                      <>
                        {" · "}
                        <span style={{ color: "var(--amber)" }}>
                          {s.awaitingConsent} in attesa consenso
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <span
                  className="ds-chip"
                  style={{
                    fontSize: 10.5,
                    background:
                      s.status === "auto"
                        ? "var(--primary-weak)"
                        : "var(--bg-sunken)",
                    color:
                      s.status === "auto"
                        ? "var(--primary-ds)"
                        : "var(--fg-muted)",
                  }}
                >
                  {s.status === "auto" ? "attiva" : "in pausa"}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  disabled={busy === s.id}
                  className="ds-btn ds-btn-sm ds-btn-ghost"
                  style={{ fontSize: 11.5 }}
                >
                  {s.status === "auto" ? (
                    <>
                      <Icon name="pause-circle" size={12} /> Pausa
                    </>
                  ) : (
                    <>
                      <Icon name="play" size={12} /> Riprendi
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionBody>
    </SectionCard>
  );
}
