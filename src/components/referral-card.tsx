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
  stats: { total: number; paying: number; credits?: number; rewards?: number };
}

/**
 * Card "Invita un amico" nel /settings.
 * Mostra il link univoco dell'utente + stats (invitati totali, paganti).
 * Reward: quando un amico completa il primo pagamento, l'invitante riceve
 * un credito pari a un mese del suo piano.
 */
export function ReferralCard() {
  const [data, setData] = useState<MyReferral | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/referral/me");
      const body = await response.json();
      if (!response.ok || typeof body.link !== "string" || !body.stats) throw new Error("Referral unavailable");
      setData(body);
    } catch { setData(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function copyLink() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      toast.success("Link copiato!");
    } catch {
      toast.error("Copia fallita — copia manualmente");
    }
  }

  return (
    <SectionCard>
      <SectionHead
        icon={<Icon name="sparkles" size={14} />}
        title="Invita un amico"
      />
      <SectionBody>
        <p style={{ fontSize: 12.5, color: "var(--fg-muted)", margin: "0 0 14px", lineHeight: 1.55 }}>
          Quando un amico si iscrive col tuo link e completa il primo pagamento dopo la prova, ricevi{" "}
          <strong style={{ color: "var(--fg)" }}>un mese di credito</strong>: sul prossimo rinnovo se sei abbonato, altrimenti al tuo prossimo upgrade.
          {data && (data.stats.credits ?? 0) > 0 && (
            <span style={{ display: "block", marginTop: 6, color: "hsl(var(--primary))", fontWeight: 600 }}>
              Hai {data.stats.credits} {data.stats.credits === 1 ? "mese gratis" : "mesi gratis"} da usare al prossimo checkout.
            </span>
          )}
        </p>

        {loading ? (
          <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>Carico…</div>
        ) : !data ? (
          <div role="alert" style={{ fontSize: 13, color: "var(--fg-muted)" }}>Il link di invito non è disponibile. <button type="button" className="ds-btn ds-btn-sm" onClick={() => void load()}>Riprova</button></div>
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
                aria-label="Il tuo link di invito"
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
              <Stat label="Premi confermati" value={data.stats.paying} tone="good" />
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
