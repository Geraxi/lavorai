"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/design/icon";

interface Slide {
  icon: IconName;
  color: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: "sparkles",
    color: "var(--primary-ds)",
    title: "Benvenuto in LavorAI",
    body: "Il copilota italiano per la ricerca del lavoro. Ti diamo un tour veloce in 3 passaggi per iniziare nel modo giusto.",
  },
  {
    icon: "briefcase",
    color: "var(--blue)",
    title: "Candidati in un click",
    body: "Sfoglia il job board, clicca su un annuncio e LavorAI ottimizza il CV per quel ruolo specifico e invia la candidatura per te — portali italiani e internazionali.",
  },
  {
    icon: "chart",
    color: "var(--amber)",
    title: "Monitora tutto dalla dashboard",
    body: "Candidature, risposte dei recruiter, ATS score, funnel di conversione. Tutti i dati in un posto solo — analytics che usi davvero.",
  },
];

export function WelcomeModal({ show }: { show: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(show);
  const [step, setStep] = useState(0);

  if (!open) return null;

  async function dismiss() {
    setOpen(false);
    await fetch("/api/onboarding/welcome-seen", { method: "POST" }).catch(
      () => null,
    );
    router.refresh();
  }

  async function finish() {
    await fetch("/api/onboarding/welcome-seen", { method: "POST" }).catch(
      () => null,
    );
    setOpen(false);
    // Prima candidatura = browse del job board (azione reale, non loop onboarding)
    router.push("/jobs");
  }

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,16,18,0.55)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(4px)",
      }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: 520,
          padding: 40,
          position: "relative",
        }}
      >
        <button
          onClick={dismiss}
          type="button"
          aria-label="Chiudi"
          className="ds-btn ds-btn-ghost"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            padding: 0,
          }}
        >
          <Icon name="x" size={14} />
        </button>

        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 14,
            background: `${slide.color.replace("var(", "color-mix(in oklch, ").replace(")", ", transparent 88%)")}`,
            color: slide.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <Icon name={slide.icon} size={26} />
        </div>

        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            margin: "0 0 10px",
          }}
        >
          {slide.title}
        </h2>
        <p
          style={{
            fontSize: 14.5,
            color: "var(--fg-muted)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {slide.body}
        </p>

        {/* Dots */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 28,
            marginBottom: 24,
          }}
        >
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Vai allo step ${i + 1}`}
              onClick={() => setStep(i)}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 3,
                border: "none",
                background:
                  i <= step ? "var(--fg)" : "var(--border-ds)",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            type="button"
            className="ds-btn ds-btn-ghost"
            onClick={dismiss}
          >
            Salta
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button
                type="button"
                className="ds-btn"
                onClick={() => setStep((s) => s - 1)}
              >
                ← Indietro
              </button>
            )}
            <button
              type="button"
              className="ds-btn ds-btn-primary"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            >
              {isLast ? (
                <>
                  Inizia <Icon name="arrow-right" size={13} />
                </>
              ) : (
                <>
                  Avanti <Icon name="arrow-right" size={13} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
