"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Icon } from "@/components/design/icon";
import { FOUNDER_VOCABULARY } from "@/lib/founder-coach/data/vocabulary";
import type { FounderVocabularyTerm } from "@/lib/founder-coach/types";

const CATEGORIES: Array<{ id: FounderVocabularyTerm["category"]; label: string }> = [
  { id: "ownership", label: "Ownership" },
  { id: "compensation", label: "Compensation" },
  { id: "valuation", label: "Valuation" },
  { id: "operations", label: "Operations" },
  { id: "go_to_market", label: "Go-to-market" },
  { id: "exit", label: "Exit" },
  { id: "strategy", label: "Strategy" },
];

export default function VocabularyPage() {
  const [filter, setFilter] = useState<"all" | FounderVocabularyTerm["category"]>("all");
  const [search, setSearch] = useState("");
  const [flipped, setFlipped] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = FOUNDER_VOCABULARY;
    if (filter !== "all") list = list.filter((t) => t.category === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          t.definitionSimple.toLowerCase().includes(q),
      );
    }
    return list;
  }, [filter, search]);

  function toggleFlip(id: string) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
        F · Founder Vocabulary
      </h1>
      <p style={{ fontSize: 14.5, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.55, maxWidth: 720 }}>
        {FOUNDER_VOCABULARY.length} termini founder-level con definizione,
        quando usarli, frase pronta, errore da evitare. Clicca una card per
        girarla.
      </p>

      <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Cerca termine..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ds-input"
          style={{ flex: "1 1 200px", maxWidth: 300 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="Tutti" />
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c.id}
              active={filter === c.id}
              onClick={() => setFilter(c.id)}
              label={c.label}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 22,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {filtered.map((t) => (
          <Flashcard key={t.id} term={t} flipped={flipped.has(t.id)} onFlip={() => toggleFlip(t.id)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div
          style={{
            padding: "40px 24px",
            textAlign: "center",
            color: "var(--fg-muted)",
            fontSize: 14,
          }}
        >
          Nessun termine trovato.
        </div>
      )}
    </div>
  );
}

function Flashcard({
  term,
  flipped,
  onFlip,
}: {
  term: FounderVocabularyTerm;
  flipped: boolean;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onFlip}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "left",
        gap: 10,
        padding: 18,
        borderRadius: 14,
        background: flipped
          ? "linear-gradient(180deg, hsl(var(--primary) / 0.10), var(--bg-elev) 70%)"
          : "var(--bg-elev)",
        border: flipped
          ? "1px solid hsl(var(--primary) / 0.40)"
          : "1px solid var(--border-ds)",
        cursor: "pointer",
        minHeight: 200,
        transition: "background 0.2s, border-color 0.2s",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.015em" }}>{term.term}</div>
        <span
          style={{
            fontSize: 10,
            padding: "3px 7px",
            borderRadius: 5,
            background: "var(--bg-sunken)",
            color: "var(--fg-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          {term.category.replace(/_/g, " ")}
        </span>
      </div>

      {!flipped ? (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg-muted)" }}>
            {term.definitionSimple}
          </div>
          <div style={{ marginTop: "auto", fontSize: 11, color: "var(--fg-subtle)" }}>
            Tocca per la frase pronta →
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "hsl(var(--primary))" }}>
            Quando usarla
          </div>
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
            {term.whenToUse}
          </div>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "hsl(var(--primary) / 0.10)",
              border: "1px solid hsl(var(--primary) / 0.25)",
              fontSize: 12.5,
              lineHeight: 1.55,
              fontStyle: "italic",
            }}
          >
            "{term.readyPhrase}"
          </div>
          <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", lineHeight: 1.45 }}>
            <strong style={{ color: "#DC2626" }}>Errore comune:</strong> {term.commonMistake}
          </div>
        </>
      )}
    </button>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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
        letterSpacing: "-0.005em",
      }}
    >
      {label}
    </button>
  );
}
