"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/design/icon";
import { FOUNDER_INTERVIEW_QUESTIONS } from "@/lib/founder-coach/data/interview-questions";
import type { InterviewQuestion } from "@/lib/founder-coach/types";

const CATEGORIES: Array<{ id: InterviewQuestion["category"]; label: string }> = [
  { id: "intro", label: "Intro" },
  { id: "motivation", label: "Motivazione" },
  { id: "ai_experience", label: "Esperienza AI" },
  { id: "leadership", label: "Leadership" },
  { id: "decision_making", label: "Decision making" },
  { id: "compensation", label: "Compensation" },
  { id: "vision", label: "Vision" },
  { id: "conflict", label: "Conflitti" },
  { id: "first_90_days", label: "Primi 90 giorni" },
  { id: "uncertainty", label: "Incertezza" },
];

export default function InterviewDominationPage() {
  const [filter, setFilter] = useState<"all" | InterviewQuestion["category"]>("all");
  const [openId, setOpenId] = useState<string | null>(FOUNDER_INTERVIEW_QUESTIONS[0]?.id ?? null);

  const list =
    filter === "all"
      ? FOUNDER_INTERVIEW_QUESTIONS
      : FOUNDER_INTERVIEW_QUESTIONS.filter((q) => q.category === filter);

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
        D · Interview Domination
      </h1>
      <p style={{ fontSize: 14.5, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.55, maxWidth: 720 }}>
        12 domande critiche founder-level con: cosa l&apos;intervistatore valuta
        davvero, framework, risposta modello, anti-pattern da evitare.
      </p>

      <div
        style={{
          marginTop: 22,
          padding: "12px 14px",
          background: "var(--bg-elev)",
          borderRadius: 10,
          border: "1px solid var(--border-ds)",
          fontSize: 12.5,
          color: "var(--fg-muted)",
        }}
      >
        💡 Per risposte personalizzate al tuo CV + JD specifico, usa il{" "}
        <Link
          href="/interview/live"
          style={{ color: "hsl(var(--primary))", textDecoration: "underline" }}
        >
          Live Copilot
        </Link>
        : ti suggerisce risposte in &lt;2s durante la call vera.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 18 }}>
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label="Tutte" />
        {CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            active={filter === c.id}
            onClick={() => setFilter(c.id)}
            label={c.label}
          />
        ))}
      </div>

      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
        {list.map((q) => {
          const open = openId === q.id;
          return (
            <div
              key={q.id}
              style={{
                padding: 20,
                borderRadius: 14,
                background: open
                  ? "linear-gradient(180deg, hsl(var(--primary) / 0.06), var(--bg-elev) 60%)"
                  : "var(--bg-elev)",
                border: open
                  ? "1px solid hsl(var(--primary) / 0.30)"
                  : "1px solid var(--border-ds)",
              }}
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : q.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  width: "100%",
                  textAlign: "left",
                  color: "inherit",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div style={{ flex: 1, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
                  {q.question}
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
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                  <Meta label="Cosa valutano davvero" text={q.whatTheyEvaluate} />
                  <Meta label="Framework di risposta" text={q.framework} />
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: 10,
                      background: "hsl(var(--primary) / 0.10)",
                      border: "1px solid hsl(var(--primary) / 0.30)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: "hsl(var(--primary))",
                        marginBottom: 8,
                      }}
                    >
                      Risposta modello (italiano professionale)
                    </div>
                    <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>
                      "{q.sampleAnswer}"
                    </p>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: "#DC2626",
                        marginBottom: 6,
                      }}
                    >
                      ❌ Anti-pattern
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      {q.pitfalls.map((p, i) => (
                        <li key={i} style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
                          · {p}
                        </li>
                      ))}
                    </ul>
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

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12,
        padding: "5px 11px",
        borderRadius: 999,
        background: active ? "hsl(var(--primary) / 0.18)" : "var(--bg-elev)",
        color: active ? "hsl(var(--primary))" : "var(--fg-muted)",
        border: active ? "1px solid hsl(var(--primary) / 0.35)" : "1px solid var(--border-ds)",
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

function Meta({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--fg-muted)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--fg)" }}>{text}</div>
    </div>
  );
}
