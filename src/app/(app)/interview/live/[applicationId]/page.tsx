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
  id: string;
  question: string;
  headline: string;
  bullets: string[];
  speakingNote: string;
  latencyMs: number;
  loading: boolean;
  ts: number;
}

/**
 * Interview Copilot — TELEPROMPTER MODE
 *
 * Pensato per essere aperto AFFIANCO a Google Meet/Zoom durante un
 * colloquio reale. Tre modi di catturare la domanda:
 *
 *   1. Auto-listening (Chrome extension paired + Whisper)
 *      → trascrizione continua, auto-detect quando l'intervistatore
 *        fa una domanda, suggerimento appare da solo.
 *
 *   2. Browser dictation (Web Speech API)
 *      → tu ripeti la domanda al microfono del browser, transcribe
 *        locale, premi suggest.
 *
 *   3. Manual paste / type
 *      → fallback sempre disponibile.
 *
 * Layout teleprompter: poco testo, grande, ad alto contrasto, leggibile
 * mentre guardi la camera. Auto-scroll alla risposta nuova.
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

  // Auto-listening: polling del transcript dal backend (extension push)
  const [autoListen, setAutoListen] = useState(false);
  const [lastTranscriptTs, setLastTranscriptTs] = useState<string | null>(null);
  const [pendingChunks, setPendingChunks] = useState<string[]>([]);

  // Refs
  const recognitionRef = useRef<unknown>(null);
  const teleprompterRef = useRef<HTMLDivElement>(null);
  const lastAutoTriggerRef = useRef<number>(0);
  const submitRef = useRef<((q: string) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!applicationId) return;
    Promise.all([
      fetch(`/api/applications/${applicationId}`).then((r) => r.json()),
      fetch(`/api/interview/session/${applicationId}`).then((r) => r.json()),
    ])
      .then(([appData, sessData]) => {
        if (appData?.application) setApp(appData.application);
        if (sessData?.session?.pairingCode)
          setPairingCode(sessData.session.pairingCode);
      })
      .catch(() => void 0);
  }, [applicationId]);

  // Core submit (lo wrappiamo in un ref così auto-listen può richiamarlo
  // senza dipendere dallo stato "question").
  const submitQuestion = useCallback(
    async (q: string) => {
      const cleaned = q.trim();
      if (!cleaned || loading) return;
      setLoading(true);
      const turnId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const placeholder: SuggestionTurn = {
        id: turnId,
        question: cleaned,
        headline: "",
        bullets: [],
        speakingNote: "",
        latencyMs: 0,
        loading: true,
        ts: Date.now(),
      };
      setTurns((prev) => [placeholder, ...prev]);
      setQuestion("");

      try {
        const res = await fetch("/api/interview/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId, question: cleaned }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.message ?? "Errore Copilot");
          setTurns((prev) => prev.filter((t) => t.id !== turnId));
          return;
        }
        const s = data.suggestion;
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  headline: s.headline,
                  bullets: s.bullets ?? [],
                  speakingNote: s.speakingNote ?? "",
                  latencyMs: s.latencyMs ?? 0,
                  loading: false,
                }
              : t,
          ),
        );
        // Auto-scroll alla top del teleprompter
        setTimeout(() => {
          teleprompterRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }, 50);
      } catch {
        toast.error("Errore rete");
        setTurns((prev) => prev.filter((t) => t.id !== turnId));
      } finally {
        setLoading(false);
      }
    },
    [applicationId, loading],
  );

  // Keep ref aggiornata
  useEffect(() => {
    submitRef.current = submitQuestion;
  }, [submitQuestion]);

  // Cmd/Ctrl + Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void submitQuestion(question);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitQuestion, question]);

  // AUTO-LISTEN: poll del transcript ogni 2s quando attivo.
  // Quando arriva un chunk che SEMBRA una domanda, auto-trigger
  // del suggest (con debounce per non sparare a raffica).
  useEffect(() => {
    if (!autoListen || !applicationId) return;
    let cancelled = false;

    async function pollTranscript() {
      if (cancelled) return;
      try {
        const url = `/api/interview/transcript/${applicationId}${
          lastTranscriptTs ? `?since=${encodeURIComponent(lastTranscriptTs)}` : ""
        }`;
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        const chunks: Array<{ ts: string; text: string }> = data.chunks ?? [];
        if (chunks.length > 0) {
          const newest = chunks[chunks.length - 1];
          setLastTranscriptTs(newest.ts);
          setPendingChunks((prev) => [...prev, ...chunks.map((c) => c.text)]);

          // Aggrega le frasi accumulate e cerca una domanda completa
          const aggregated = chunks.map((c) => c.text).join(" ").trim();
          if (looksLikeQuestion(aggregated)) {
            // Debounce: max una auto-call ogni 8s per non saturare
            const now = Date.now();
            if (now - lastAutoTriggerRef.current > 8_000) {
              lastAutoTriggerRef.current = now;
              setPendingChunks([]);
              if (submitRef.current) {
                void submitRef.current(aggregated);
              }
            }
          }
        }
      } catch {
        /* silenzioso, riprova al prossimo tick */
      }
    }

    const interval = setInterval(pollTranscript, 2000);
    void pollTranscript();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [autoListen, applicationId, lastTranscriptTs]);

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
    rec.onresult = (e) => {
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

  const latestTurn = turns[0];

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      {/* TOP BAR — compatta, info essenziali + status auto-listen */}
      <header
        style={{
          padding: "10px 18px",
          borderBottom: "1px solid var(--border-ds)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <Link
            href={`/interview/prep/${applicationId}`}
            style={{
              fontSize: 11.5,
              color: "var(--fg-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Icon name="chevron-right" size={10} style={{ transform: "rotate(180deg)" }} />
            Brief
          </Link>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 320,
              }}
            >
              {app?.job.title ?? "..."}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
              {app?.job.company ?? ""} · Teleprompter mode
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => setAutoListen((v) => !v)}
            className="ds-btn ds-btn-sm"
            style={{
              padding: "7px 12px",
              fontSize: 12,
              background: autoListen
                ? "hsl(var(--primary) / 0.18)"
                : "var(--bg-elev)",
              color: autoListen ? "hsl(var(--primary))" : "var(--fg)",
              border: autoListen
                ? "1px solid hsl(var(--primary) / 0.5)"
                : "1px solid var(--border-ds)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            title="Quando attivo, ascolta la trascrizione dell'extension e suggerisce automaticamente"
          >
            {autoListen ? (
              <>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: "hsl(var(--primary))",
                    animation: "ds-pulse 1.4s ease-in-out infinite",
                  }}
                />
                Live listening
              </>
            ) : (
              <>🎧 Auto-listen OFF</>
            )}
          </button>
          {pairingCode && <PairingBadge code={pairingCode} />}
        </div>
      </header>

      {/* TELEPROMPTER — grande, ad alto contrasto */}
      <div
        ref={teleprompterRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 36px 24px",
        }}
      >
        {latestTurn ? (
          <Teleprompter turn={latestTurn} />
        ) : (
          <EmptyState autoListen={autoListen} />
        )}

        {/* History sotto */}
        {turns.length > 1 && (
          <div style={{ marginTop: 36, opacity: 0.6 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--fg-muted)",
                marginBottom: 12,
              }}
            >
              Storia colloquio
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {turns.slice(1).map((t) => (
                <div
                  key={t.id}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "var(--bg-elev)",
                    border: "1px solid var(--border-ds)",
                    fontSize: 12.5,
                    color: "var(--fg-muted)",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "var(--fg)", marginBottom: 3 }}>
                    {t.question}
                  </div>
                  {t.headline && <div>→ {t.headline}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM INPUT — fallback manuale, sempre disponibile */}
      <div
        style={{
          padding: "12px 18px",
          borderTop: "1px solid var(--border-ds)",
          background: "var(--bg-elev)",
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          flexShrink: 0,
        }}
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            autoListen
              ? "Auto-listen attivo. Puoi anche scrivere/dettare qui (Cmd+Enter)..."
              : "Scrivi o detta la domanda dell'intervistatore... (Cmd+Enter per suggerire)"
          }
          rows={2}
          className="ds-input"
          style={{
            resize: "none",
            fontFamily: "inherit",
            fontSize: 13.5,
            flex: 1,
            minHeight: 50,
            lineHeight: 1.5,
          }}
        />
        <button
          type="button"
          onClick={toggleDictation}
          className="ds-btn ds-btn-sm"
          style={{
            padding: "10px 12px",
            fontSize: 12,
            background: dictating ? "hsl(var(--primary) / 0.18)" : undefined,
            color: dictating ? "hsl(var(--primary))" : undefined,
            borderColor: dictating ? "hsl(var(--primary) / 0.4)" : undefined,
            whiteSpace: "nowrap",
          }}
        >
          {dictating ? "🎙 Recording" : "🎙 Detta"}
        </button>
        <button
          type="button"
          onClick={() => void submitQuestion(question)}
          disabled={loading || !question.trim()}
          className="ds-btn ds-btn-primary"
          style={{ padding: "10px 16px", fontSize: 13, whiteSpace: "nowrap" }}
        >
          {loading ? (
            <>
              <Icon name="refresh" size={13} /> ...
            </>
          ) : (
            <>
              Suggerisci <Icon name="zap" size={12} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Heuristic: la frase aggregata sembra una domanda?
 * - Termina con "?"
 * - Inizia con question word IT/EN
 * - Contiene "?" interno (es. "ciao, una domanda — perché vuoi questo ruolo?")
 */
function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  if (t.includes("?")) return true;
  const lower = t.toLowerCase();
  const startsWith =
    /^(perché|perche|cosa|come|quando|dove|chi|quale|quali|quanto|hai|sei|puoi|potresti|raccontami|parlami|spiegami|why|what|how|when|where|who|which|can you|could you|tell me|describe|walk me|explain)/.test(
      lower,
    );
  // Almeno 4 parole + opener tipico
  const wordCount = t.split(/\s+/).length;
  return startsWith && wordCount >= 4;
}

function Teleprompter({ turn }: { turn: SuggestionTurn }) {
  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      {/* Domanda — più piccola, sopra */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--fg-muted)",
          marginBottom: 8,
        }}
      >
        Domanda
      </div>
      <div
        style={{
          fontSize: 16,
          lineHeight: 1.5,
          color: "var(--fg-muted)",
          paddingBottom: 18,
          marginBottom: 24,
          borderBottom: "1px solid var(--border-ds)",
          fontStyle: "italic",
        }}
      >
        "{turn.question}"
      </div>

      {turn.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton width="80%" height={32} />
          <Skeleton width="100%" height={20} />
          <Skeleton width="90%" height={20} />
          <Skeleton width="60%" height={20} />
        </div>
      ) : (
        <>
          {/* Speaking note — GRANDE, è il teleprompter principale */}
          {turn.speakingNote && (
            <div
              style={{
                padding: "24px 28px",
                borderRadius: 18,
                background:
                  "linear-gradient(180deg, hsl(var(--primary) / 0.14), hsl(var(--primary) / 0.04))",
                border: "1px solid hsl(var(--primary) / 0.35)",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "hsl(var(--primary))",
                  marginBottom: 12,
                }}
              >
                ▶ Apri così
              </div>
              <p
                style={{
                  fontSize: "clamp(22px, 2.6vw, 30px)",
                  fontWeight: 600,
                  lineHeight: 1.4,
                  margin: 0,
                  color: "var(--fg)",
                  letterSpacing: "-0.015em",
                }}
              >
                {turn.speakingNote}
              </p>
            </div>
          )}

          {/* Headline come secondario, da glance */}
          {turn.headline && (
            <div
              style={{
                fontSize: 14,
                color: "var(--fg-muted)",
                fontWeight: 600,
                marginBottom: 16,
                fontStyle: "italic",
              }}
            >
              💡 {turn.headline}
            </div>
          )}

          {/* Bullet — punti chiave, leggibili veloci */}
          {turn.bullets.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {turn.bullets.map((b, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "flex-start",
                    fontSize: 17,
                    lineHeight: 1.5,
                    color: "var(--fg)",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      background: "hsl(var(--primary) / 0.18)",
                      color: "hsl(var(--primary))",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      marginTop: 2,
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
              marginTop: 28,
              fontSize: 10.5,
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

function EmptyState({ autoListen }: { autoListen: boolean }) {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: "60px auto",
        textAlign: "center",
        color: "var(--fg-muted)",
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>🎯</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--fg)",
          marginBottom: 12,
          letterSpacing: "-0.015em",
        }}
      >
        {autoListen ? "In ascolto..." : "Pronto per il colloquio"}
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 540, margin: "0 auto" }}>
        {autoListen ? (
          <>
            L&apos;extension Chrome sta inviando audio dalla tab Meet/Zoom.
            Quando rilevo una domanda, qui sopra apparirà la risposta da
            pronunciare ad alta voce.
          </>
        ) : (
          <>
            Apri Google Meet in un&apos;altra finestra. Attiva{" "}
            <strong>Live listening</strong> in alto a destra dopo aver
            paired la Chrome extension, oppure detta/scrivi le domande qui
            sotto.
          </>
        )}
      </p>
    </div>
  );
}

function Skeleton({ width, height }: { width: string; height: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
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
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(code);
        toast.success(`Codice copiato: ${code}`);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 8,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        cursor: "pointer",
        color: "var(--fg)",
      }}
      title="Codice di pairing per la Chrome extension. Click per copiare."
    >
      <span
        style={{
          fontSize: 9.5,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        Pair code
      </span>
      <span
        className="mono"
        style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em" }}
      >
        {code}
      </span>
    </button>
  );
}
