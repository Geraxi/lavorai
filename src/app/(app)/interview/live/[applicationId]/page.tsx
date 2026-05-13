"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";

interface AppInfo {
  id: string;
  job: { title: string; company: string | null; location: string | null };
}

interface SuggestionTurn {
  question: string;
  headline: string;
  bullets: string[];
  speakingNote: string;
  latencyMs: number;
  loading: boolean;
}

/**
 * Interview Copilot — pagina live.
 *
 * Layout 3 colonne (desktop) / stack verticale (mobile):
 *   - Sinistra: brief generato in /interview/prep
 *   - Centro: textarea per domanda (con Web Speech dictation) + cronologia
 *   - Destra: ultimo suggerimento AI in evidenza
 *
 * Hot path (target <2s):
 *   1. Utente preme Cmd+Enter o pulsante Suggerisci
 *   2. POST /api/interview/suggest con applicationId + question
 *   3. Spinner + ottimistic loading turn appended
 *   4. Response → patch turn con dati AI
 */
export default function InterviewLivePage() {
  const params = useParams<{ applicationId: string }>();
  const applicationId = params?.applicationId ?? "";

  const [app, setApp] = useState<AppInfo | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<SuggestionTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [dictating, setDictating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<unknown>(null);

  useEffect(() => {
    if (!applicationId) return;
    Promise.all([
      fetch(`/api/applications/${applicationId}`).then((r) => r.json()),
      fetch(`/api/interview/session/${applicationId}`).then((r) => r.json()),
    ])
      .then(([appData, sessData]) => {
        if (appData?.application) setApp(appData.application);
        if (sessData?.session?.pairingCode) setPairingCode(sessData.session.pairingCode);
      })
      .catch(() => void 0);
  }, [applicationId]);

  const submitQuestion = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    const placeholderTurn: SuggestionTurn = {
      question: q,
      headline: "",
      bullets: [],
      speakingNote: "",
      latencyMs: 0,
      loading: true,
    };
    setTurns((prev) => [placeholderTurn, ...prev]);
    setQuestion("");
    try {
      const res = await fetch("/api/interview/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "Errore Copilot");
        setTurns((prev) => prev.filter((t) => t !== placeholderTurn));
        setLoading(false);
        return;
      }
      const s = data.suggestion;
      setTurns((prev) =>
        prev.map((t) =>
          t === placeholderTurn
            ? {
                question: q,
                headline: s.headline,
                bullets: s.bullets ?? [],
                speakingNote: s.speakingNote ?? "",
                latencyMs: s.latencyMs ?? 0,
                loading: false,
              }
            : t,
        ),
      );
    } catch {
      toast.error("Errore rete");
      setTurns((prev) => prev.filter((t) => t !== placeholderTurn));
    } finally {
      setLoading(false);
    }
  }, [question, loading, applicationId]);

  // Cmd/Ctrl + Enter triggers submit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void submitQuestion();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitQuestion]);

  function toggleDictation() {
    type SR = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: ((e: { results: { transcript: string }[][] }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => SR;
      webkitSpeechRecognition?: new () => SR;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error(
        "Dettatura non supportata in questo browser — usa Chrome/Edge desktop.",
      );
      return;
    }
    if (dictating && recognitionRef.current) {
      (recognitionRef.current as SR).stop();
      setDictating(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "it-IT";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: { results: { transcript: string }[][] }) => {
      // Concatena ultimi N risultati
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        const alt = e.results[i][0];
        if (alt?.transcript) text += alt.transcript + " ";
      }
      setQuestion(text.trim());
    };
    rec.onerror = () => setDictating(false);
    rec.onend = () => setDictating(false);
    rec.start();
    recognitionRef.current = rec;
    setDictating(true);
  }

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Interview Copilot · LIVE
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.015em", marginTop: 2 }}>
            {app?.job.title ?? "..."}
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            {app?.job.company ?? ""}
          </div>
        </div>
        {pairingCode && (
          <PairingBadge code={pairingCode} />
        )}
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.6fr)",
        }}
        className="copilot-layout"
      >
        {/* LEFT: input + history */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
            }}
          >
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--fg-muted)",
                marginBottom: 8,
                display: "block",
              }}
            >
              Domanda dell&apos;intervistatore
            </label>
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Incolla, scrivi o detta la domanda... (Cmd+Enter per suggerire)"
              rows={4}
              className="ds-input"
              style={{
                resize: "vertical",
                fontFamily: "inherit",
                fontSize: 14,
                lineHeight: 1.5,
                width: "100%",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 10,
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={toggleDictation}
                className="ds-btn ds-btn-sm"
                style={{
                  padding: "8px 12px",
                  fontSize: 12.5,
                  background: dictating ? "hsl(var(--primary) / 0.15)" : undefined,
                  color: dictating ? "hsl(var(--primary))" : undefined,
                  borderColor: dictating ? "hsl(var(--primary) / 0.4)" : undefined,
                }}
                title="Dettatura vocale (Chrome/Edge)"
              >
                {dictating ? (
                  <>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: "hsl(var(--primary))",
                        display: "inline-block",
                        marginRight: 6,
                        animation: "ds-pulse 1.2s ease-in-out infinite",
                      }}
                    />
                    Detto...
                  </>
                ) : (
                  <>🎙 Detta</>
                )}
              </button>
              <button
                type="button"
                onClick={submitQuestion}
                disabled={loading || !question.trim()}
                className="ds-btn ds-btn-primary"
                style={{ padding: "9px 16px", fontSize: 13 }}
              >
                {loading ? (
                  <>
                    <Icon name="refresh" size={13} /> Penso...
                  </>
                ) : (
                  <>
                    Suggerisci risposta <Icon name="zap" size={13} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* History */}
          {turns.length > 0 && (
            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: "var(--bg-elev)",
                border: "1px solid var(--border-ds)",
                maxHeight: 380,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--fg-muted)",
                  marginBottom: 10,
                }}
              >
                Cronologia ({turns.length})
              </div>
              {turns.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setQuestion(t.question)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    marginBottom: 6,
                    borderRadius: 8,
                    background: "transparent",
                    border: "1px solid transparent",
                    color: "var(--fg-muted)",
                    fontSize: 12.5,
                    lineHeight: 1.4,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-sunken)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  Q: {t.question.slice(0, 100)}
                  {t.question.length > 100 ? "..." : ""}
                </button>
              ))}
            </div>
          )}

          <Link
            href={`/interview/prep/${applicationId}`}
            style={{
              fontSize: 12,
              color: "var(--fg-subtle)",
              textAlign: "center",
              padding: "6px 0",
            }}
          >
            ← Modifica brief
          </Link>
        </div>

        {/* RIGHT: latest suggestion */}
        <div>
          {turns.length === 0 ? (
            <EmptyState />
          ) : (
            <SuggestionCard turn={turns[0]} />
          )}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.copilot-layout) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "60px 28px",
        borderRadius: 16,
        background: "var(--bg-elev)",
        border: "1px dashed var(--border-ds)",
        textAlign: "center",
        color: "var(--fg-muted)",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>
        Pronto per il colloquio
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55, maxWidth: 380, margin: "0 auto" }}>
        Quando l&apos;intervistatore fa una domanda, scrivila o dettala
        a sinistra. Ti rispondo in ~2 secondi con bullet, frase di
        apertura e contesto dal tuo CV.
      </div>
    </div>
  );
}

function SuggestionCard({ turn }: { turn: SuggestionTurn }) {
  return (
    <div
      style={{
        padding: 22,
        borderRadius: 16,
        background:
          "linear-gradient(180deg, hsl(var(--primary) / 0.06), transparent)",
        border: "1px solid hsl(var(--primary) / 0.25)",
        minHeight: 420,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "hsl(var(--primary))",
        }}
      >
        Domanda
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: "var(--fg-muted)",
          paddingBottom: 14,
          borderBottom: "1px solid var(--border-ds)",
        }}
      >
        “{turn.question}”
      </div>

      {turn.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton width="60%" height={16} />
          <Skeleton width="100%" height={12} />
          <Skeleton width="95%" height={12} />
          <Skeleton width="85%" height={12} />
        </div>
      ) : (
        <>
          {turn.headline && (
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.015em",
                lineHeight: 1.3,
              }}
            >
              {turn.headline}
            </div>
          )}
          {turn.speakingNote && (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 10,
                background: "hsl(var(--primary) / 0.10)",
                border: "1px solid hsl(var(--primary) / 0.30)",
                fontSize: 14,
                fontStyle: "italic",
                lineHeight: 1.6,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "hsl(var(--primary))",
                  marginBottom: 6,
                  fontStyle: "normal",
                }}
              >
                Da dire ad alta voce
              </div>
              {turn.speakingNote}
            </div>
          )}
          {turn.bullets.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {turn.bullets.map((b, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: 10,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: "var(--fg)",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: "hsl(var(--primary) / 0.18)",
                      color: "hsl(var(--primary))",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      marginTop: 1,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          <div
            style={{
              marginTop: "auto",
              fontSize: 11,
              color: "var(--fg-subtle)",
              textAlign: "right",
            }}
          >
            generato in {turn.latencyMs}ms
          </div>
        </>
      )}
    </div>
  );
}

function Skeleton({ width, height }: { width: string; height: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background:
          "linear-gradient(90deg, var(--bg-sunken) 0%, var(--bg-elev) 50%, var(--bg-sunken) 100%)",
        backgroundSize: "200% 100%",
        animation: "ds-shimmer 1.6s linear infinite",
      }}
    />
  );
}

function PairingBadge({ code }: { code: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 10,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 10,
            color: "var(--fg-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            lineHeight: 1,
          }}
        >
          Pair Chrome ext.
        </div>
        <div
          className="mono"
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.06em",
            marginTop: 2,
          }}
        >
          {code}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(code);
          toast.success("Codice copiato");
        }}
        className="ds-btn ds-btn-sm"
        style={{ padding: "6px 10px", fontSize: 11.5 }}
      >
        Copia
      </button>
    </div>
  );
}
