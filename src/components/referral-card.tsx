"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import { Icon } from "@/components/design/icon";

interface MyReferral {
  code: string;
  link: string;
  stats: { total: number; paying: number };
}

/**
 * Card "Invita un amico" nel /settings.
 * Mostra il link univoco dell'utente + stats (invitati totali, paganti).
 * Reward: quando un amico passa a Pro, entrambi ricevono 1 mese gratis
 * (riscatto manuale via supporto in v1).
 */
export function ReferralCard() {
  const [data, setData] = useState<MyReferral | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/referral/me")
      .then((r) => r.json())
      .then((j) => setData(j))
      .finally(() => setLoading(false));
  }, []);

  function copyLink() {
    if (!data) return;
    try {
      navigator.clipboard.writeText(data.link);
      toast.success("Link copiato!");
    } catch {
      toast.error("Copia fallita — copia manualmente");
    }
  }

  return (
    <SectionCard>
      <SectionHead
        icon={<Icon name="sparkles" size={14} />}
        title="Invita un amico — 1 mese Pro per entrambi"
      />
      <SectionBody>
        <p style={{ fontSize: 12.5, color: "var(--fg-muted)", margin: "0 0 14px", lineHeight: 1.55 }}>
          Quando un amico si iscrive col tuo link e passa a Pro, ricevete{" "}
          <strong style={{ color: "var(--fg)" }}>1 mese gratis</strong> entrambi.
        </p>

        {loading ? (
          <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>Carico…</div>
        ) : !data ? (
          <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>Errore nel caricamento.</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <input
                readOnly
                value={data.link}
                style={{
                  flex: 1,
                  fontSize: 13,
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border-ds)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  fontFamily: "var(--font-mono, monospace)",
                  minWidth: 0,
                }}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={copyLink}
                className="ds-btn ds-btn-accent"
                style={{ padding: "8px 14px", fontSize: 13, flexShrink: 0 }}
              >
                <Icon name="check" size={12} /> Copia
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <Stat label="Invitati" value={data.stats.total} />
              <Stat label="Diventati Pro" value={data.stats.paying} tone="good" />
            </div>
          </>
        )}
      </SectionBody>
    </SectionCard>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good";
}) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: "var(--bg)",
        border: "1px solid var(--border-ds)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: tone === "good" ? "hsl(var(--primary))" : "var(--fg)",
          marginTop: 2,
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </div>
    </div>
  );
}
