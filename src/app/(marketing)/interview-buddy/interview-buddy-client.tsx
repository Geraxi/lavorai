"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";

/**
 * Mock interview AI conversazionale. Client-side state holds full
 * history; server è stateless. 5 domande → summary finale.
 *
 * Flow:
 *   Step "setup":   form per JD / role / company
 *   Step "chat":    conversation alternata AI/user, 5 round
 *   Step "summary": final feedback (AI fa l'ultimo turn con summary)
 */

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface JobContext {
  jobDescription?: string;
  role?: string;
  company?: string;
}

export function InterviewBuddyClient() {
  const t = useTranslations("interviewBuddy");
  const locale = useLocale() === "en" ? "en" : "it";

  const [step, setStep] = useState<"setup" | "chat" | "summary">("setup");
  const [jobContext, setJobContext] = useState<JobContext>({});
  const [history, setHistory] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [freeRemaining, setFreeRemaining] = useState<number | null>(null);
  const [paywall, setPaywall] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length, loading]);

  async function callTurn(
    nextHistory: Message[],
    ctx: JobContext,
  ): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/interview-buddy/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { ...ctx, locale },
          history: nextHistory,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 402) {
        setPaywall(body.message ?? t("paywallBody"));
        setLoading(false);
        return;
      }
      if (!res.ok) {
        toast.error(body.message ?? t("genericError"));
        setLoading(false);
        return;
      }

      setHistory([
        ...nextHistory,
        { role: "assistant", content: body.message },
      ]);
      setQuestionNumber(body.questionNumber ?? 0);
      if (typeof body.freeRemaining === "number") {
        setFreeRemaining(body.freeRemaining);
      }
      if (body.isFinal) {
        setStep("summary");
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  async function onSetupSubmit(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const ctx: JobContext = {
      jobDescription: (data.get("jd") as string | null)?.trim() || undefined,
      role: (data.get("role") as string | null)?.trim() || undefined,
      company:
        (data.get("company") as string | null)?.trim() || undefined,
    };
    setJobContext(ctx);
    setStep("chat");
    // First turn: history empty → AI introduces and asks q1
    await callTurn([], ctx);
  }

  async function onAnswerSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || loading) return;
    const next: Message[] = [
      ...history,
      { role: "user", content: draft.trim() },
    ];
    setHistory(next);
    setDraft("");
    await callTurn(next, jobContext);
  }

  function restart() {
    setStep("setup");
    setHistory([]);
    setDraft("");
    setQuestionNumber(0);
    setPaywall(null);
  }

  return (
    <div
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "40px 24px 80px",
      }}
    >
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px",
            borderRadius: 999,
            background: "hsl(var(--primary)/0.1)",
            border: "1px solid hsl(var(--primary)/0.3)",
            marginBottom: 18,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "hsl(var(--primary))",
              boxShadow: "0 0 8px hsl(var(--primary)/0.6)",
            }}
          />
          <span
            className="mono"
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: "hsl(var(--primary))",
              textTransform: "uppercase",
            }}
          >
            {t("badge")}
          </span>
        </div>
        <h1
          style={{
            fontSize: "clamp(2rem, 4vw, 3.25rem)",
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1.08,
            margin: 0,
          }}
        >
          {t("title1")}{" "}
          <span className="text-gradient-accent">{t("title2")}</span>
        </h1>
        <p
          style={{
            fontSize: "clamp(0.95rem, 1.1vw, 1.1rem)",
            color: "var(--fg-muted)",
            lineHeight: 1.55,
            marginTop: 14,
            maxWidth: 580,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {step === "setup" && t("subtitleSetup")}
          {step === "chat" && t("subtitleChat", { current: questionNumber, total: 5 })}
          {step === "summary" && t("subtitleSummary")}
        </p>
      </div>

      {/* Progress bar visibile durante chat */}
      {step === "chat" && (
        <div
          style={{
            margin: "0 auto 24px",
            maxWidth: 520,
            height: 4,
            background: "var(--border-ds)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(questionNumber / 5) * 100}%`,
              background: "hsl(var(--primary))",
              transition: "width 0.4s ease",
            }}
          />
        </div>
      )}

      {/* Setup form */}
      {step === "setup" && (
        <form
          onSubmit={onSetupSubmit}
          style={{
            background: "var(--bg-elev)",
            border: "1px solid var(--border-ds)",
            borderRadius: 14,
            padding: 28,
          }}
        >
          <label className="ds-label" htmlFor="jd">
            {t("jdLabel")}
          </label>
          <textarea
            id="jd"
            name="jd"
            placeholder={t("jdPlaceholder")}
            rows={6}
            className="ds-textarea"
            style={{ marginBottom: 18 }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 22,
            }}
          >
            <div>
              <label className="ds-label" htmlFor="role">
                {t("roleLabel")}
              </label>
              <input
                id="role"
                name="role"
                type="text"
                placeholder={t("rolePlaceholder")}
                className="ds-input"
              />
            </div>
            <div>
              <label className="ds-label" htmlFor="company">
                {t("companyLabel")}
              </label>
              <input
                id="company"
                name="company"
                type="text"
                placeholder={t("companyPlaceholder")}
                className="ds-input"
              />
            </div>
          </div>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--fg-subtle)",
              marginBottom: 18,
              lineHeight: 1.5,
            }}
          >
            {t("setupHint")}
          </p>
          <button
            type="submit"
            disabled={loading}
            className="ds-btn ds-btn-primary"
            style={{
              width: "100%",
              minHeight: 52,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            <Icon name="zap" size={14} />
            {loading ? t("starting") : t("startCta")}
          </button>
          {freeRemaining !== null && (
            <p
              style={{
                marginTop: 12,
                fontSize: 12,
                color: "var(--fg-subtle)",
                textAlign: "center",
              }}
            >
              {t("freeRemaining", { count: freeRemaining })}
            </p>
          )}
        </form>
      )}

      {/* Chat */}
      {(step === "chat" || step === "summary") && (
        <>
          <div
            style={{
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              borderRadius: 14,
              padding: 22,
              minHeight: 320,
              maxHeight: "60vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {history.map((m, i) => (
              <ChatBubble key={i} msg={m} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={chatEndRef} />
          </div>

          {/* Input answer (visible during chat, hidden in summary) */}
          {step === "chat" && (
            <form
              onSubmit={onAnswerSubmit}
              style={{ marginTop: 18 }}
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("answerPlaceholder")}
                rows={4}
                disabled={loading}
                className="ds-textarea"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void onAnswerSubmit(e as unknown as FormEvent);
                  }
                }}
              />
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    color: "var(--fg-subtle)",
                  }}
                >
                  {t("submitHint")}
                </span>
                <button
                  type="submit"
                  disabled={loading || !draft.trim()}
                  className="ds-btn ds-btn-primary"
                  style={{ fontSize: 14, padding: "9px 18px" }}
                >
                  {loading ? t("thinking") : t("submitAnswer")}{" "}
                  <Icon name="arrow-right" size={13} />
                </button>
              </div>
            </form>
          )}

          {/* Summary actions */}
          {step === "summary" && (
            <div
              style={{
                marginTop: 24,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                onClick={restart}
                className="ds-btn"
                style={{ fontSize: 14 }}
              >
                <Icon name="refresh" size={13} /> {t("restartCta")}
              </button>
              <Link
                href="/signup"
                className="ds-btn ds-btn-primary"
                style={{ fontSize: 14, fontWeight: 600 }}
              >
                <Icon name="zap" size={13} /> {t("signupCta")}
              </Link>
            </div>
          )}
        </>
      )}

      {/* Paywall card (shown when free limit reached) */}
      {paywall && (
        <div
          style={{
            marginTop: 24,
            padding: 24,
            borderRadius: 14,
            background:
              "linear-gradient(135deg, hsl(var(--primary)/0.12), transparent 70%), var(--bg-elev)",
            border: "1px solid hsl(var(--primary)/0.3)",
            textAlign: "center",
          }}
        >
          <h3
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              marginBottom: 8,
            }}
          >
            {t("paywallTitle")}
          </h3>
          <p
            style={{
              fontSize: 14,
              color: "var(--fg-muted)",
              lineHeight: 1.55,
              marginBottom: 18,
            }}
          >
            {paywall}
          </p>
          <Link
            href="/signup?plan=pro"
            className="ds-btn ds-btn-primary"
            style={{ fontSize: 14, fontWeight: 600 }}
          >
            {t("paywallCta")} →
          </Link>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          padding: "12px 16px",
          borderRadius: 14,
          background: isUser ? "hsl(var(--primary)/0.12)" : "var(--bg-sunken)",
          border: isUser
            ? "1px solid hsl(var(--primary)/0.25)"
            : "1px solid var(--border-ds)",
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--fg)",
          whiteSpace: "pre-wrap",
        }}
      >
        <RichBubbleText text={msg.content} />
      </div>
    </motion.div>
  );
}

/**
 * Renderer minimal per il testo del bubble assistant: trasforma
 * **bold** in <strong>. Niente markdown engine completo per evitare
 * complessità (Claude segue le istruzioni di formato minimal).
 */
function RichBubbleText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return (
            <strong key={i} style={{ color: "var(--fg)", fontWeight: 600 }}>
              {p.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 14,
          background: "var(--bg-sunken)",
          border: "1px solid var(--border-ds)",
          display: "inline-flex",
          gap: 5,
        }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--fg-muted)",
            }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
    </div>
  );
}
