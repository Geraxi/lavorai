"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";
import { NEGOTIATION_SCRIPTS } from "@/lib/founder-coach/data/negotiation-scripts";

export default function NegotiatePage() {
  const [openId, setOpenId] = useState<string | null>(NEGOTIATION_SCRIPTS[0]?.id ?? null);

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <Link
        href="/founder-coach"
        style={{
          fontSize: 13,
          color: "var(--fg-muted)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 20,
        }}
      >
        <Icon name="chevron-right" size={11} style={{ transform: "rotate(180deg)" }} />
        Torna al modulo
      </Link>

      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.022em", margin: 0 }}>
        E · Negotiation Scripts
      </h1>
      <p style={{ fontSize: 14.5, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.55, maxWidth: 720 }}>
        8 scenari pronti con frase principale, varianti follow-up e cosa
        rispondere se l&apos;altro fa pushback. Tutto italiano professionale.
      </p>

      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
        {NEGOTIATION_SCRIPTS.map((s) => {
          const open = openId === s.id;
          return (
            <div
              key={s.id}
              style={{
                padding: 20,
                borderRadius: 14,
                background: open ? "linear-gradient(180deg, hsl(var(--primary) / 0.06), var(--bg-elev) 60%)" : "var(--bg-elev)",
                border: open ? "1px solid hsl(var(--primary) / 0.30)" : "1px solid var(--border-ds)",
                transition: "background 0.2s, border-color 0.2s",
              }}
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : s.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  width: "100%",
                  textAlign: "left",
                  color: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.01em" }}>
                      {s.title}
                    </div>
                    <ToneTag tone={s.tone} />
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 4 }}>
                    {s.context}
                  </div>
                </div>
                <Icon
                  name="chevron-right"
                  size={14}
                  style={{
                    transform: open ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.15s",
                    color: "var(--fg-muted)",
                  }}
                />
              </button>

              {open && (
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <ScriptBox
                    label="Frase principale"
                    text={s.script}
                    isPrimary
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: "var(--fg-muted)",
                        marginBottom: 6,
                      }}
                    >
                      Follow-up varianti
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {s.followUpVariants.map((v, i) => (
                        <ScriptBox key={i} text={v} />
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "rgba(217, 119, 6, 0.06)",
                      border: "1px solid rgba(217, 119, 6, 0.25)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: "#F59E0B",
                        marginBottom: 6,
                      }}
                    >
                      🛡 Se ti dicono di no
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--fg)" }}>
                      {s.bridgeIfPushback}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScriptBox({ label, text, isPrimary }: { label?: string; text: string; isPrimary?: boolean }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 10,
        background: isPrimary ? "hsl(var(--primary) / 0.10)" : "var(--bg-sunken)",
        border: isPrimary
          ? "1px solid hsl(var(--primary) / 0.30)"
          : "1px solid var(--border-ds)",
        position: "relative",
      }}
    >
      {label && (
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "hsl(var(--primary))",
            marginBottom: 6,
          }}
        >
          {label}
        </div>
      )}
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
        "{text}"
      </p>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(text);
          toast.success("Copiato negli appunti");
        }}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "transparent",
          border: "1px solid var(--border-ds)",
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 10.5,
          color: "var(--fg-muted)",
          cursor: "pointer",
        }}
      >
        Copia
      </button>
    </div>
  );
}

function ToneTag({ tone }: { tone: string }) {
  const tones: Record<string, { color: string; label: string }> = {
    diretto: { color: "#DC2626", label: "diretto" },
    esplorativo: { color: "hsl(var(--primary))", label: "esplorativo" },
    fermo: { color: "#D97706", label: "fermo" },
  };
  const t = tones[tone] ?? tones.diretto;
  return (
    <span
      style={{
        fontSize: 10,
        padding: "2px 7px",
        borderRadius: 4,
        background: `${t.color}22`,
        color: t.color,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
      }}
    >
      {t.label}
    </span>
  );
}
