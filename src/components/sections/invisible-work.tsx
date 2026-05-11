"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Reveal } from "@/components/reveal";

/**
 * "Il lavoro invisibile di chi cerca lavoro" — editorial section.
 *
 * NIENTE card. Niente icone in cerchi. Niente 3-col grid stile SaaS.
 * Solo tipografia. Lista numerata grande con cancellazione progressiva
 * sui task che LavorAI fa al posto tuo. Editoriale, calmo, specifico.
 *
 * Si appoggia al sentimento riconosciuto, non al pitch del prodotto.
 * L'unico fix prodotto è la mini-line in fondo, non aggressiva.
 */

const TASKS = [
  "Ricopiare il CV in 47 formati diversi",
  "Tradurre la stessa esperienza in inglese, poi in italiano, poi di nuovo",
  "Compilare per la trentesima volta «perché vuoi lavorare qui?»",
  "Cercare il sito carriere giusto fra dieci che sembrano uguali",
  "Aspettare risposte che non arrivano",
  "Convincersi che «domani inizio davvero»",
  "Aprire LinkedIn alle 23, chiuderlo alle 02",
  "Riscrivere la cover letter come se non l'avessi già scritta dieci volte",
];

const TASKS_EN = [
  "Re-copy your CV into 47 different formats",
  "Translate the same experience into English, then Italian, then English again",
  "Answer 'why do you want to work here?' for the thirtieth time",
  "Find the right careers page among ten that look identical",
  "Wait for replies that never come",
  "Promise yourself 'tomorrow I'll really start'",
  "Open LinkedIn at 11pm, close it at 2am",
  "Rewrite your cover letter as if you hadn't already written it ten times",
];

export function SectionInvisibleWork() {
  const t = useTranslations("invisibleWork");
  const locale = t("_locale");
  const tasks = locale === "en" ? TASKS_EN : TASKS;

  return (
    <section
      className="relative border-t border-border/60"
      style={{
        paddingTop: 120,
        paddingBottom: 120,
      }}
    >
      <div
        className="container"
        style={{ maxWidth: 880 }}
      >
        <Reveal>
          <p
            className="mono"
            style={{
              fontSize: 11.5,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "var(--fg-subtle)",
              fontWeight: 500,
              marginBottom: 28,
            }}
          >
            {t("eyebrow")}
          </p>
          <h2
            className="text-balance"
            style={{
              fontSize: "clamp(2rem, 4vw, 3.5rem)",
              fontWeight: 600,
              letterSpacing: "-0.035em",
              lineHeight: 1.1,
              maxWidth: "20ch",
            }}
          >
            {t("title")}
          </h2>
          <p
            style={{
              marginTop: 24,
              fontSize: "clamp(1rem, 1.2vw, 1.2rem)",
              lineHeight: 1.65,
              color: "var(--fg-muted)",
              maxWidth: 560,
            }}
          >
            {t("intro")}
          </p>
        </Reveal>

        {/* Lista numerata grande. Linea a sinistra per dare ritmo
            editoriale, niente bullets icon, niente colore garish. */}
        <ol
          style={{
            marginTop: 64,
            listStyle: "none",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 0,
            borderTop: "1px solid var(--border-ds)",
          }}
        >
          {tasks.map((task, i) => (
            <Reveal key={i} delay={i * 0.03}>
              <motion.li
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "clamp(20px, 4vw, 56px)",
                  padding: "26px 0",
                  borderBottom: "1px solid var(--border-ds)",
                  alignItems: "baseline",
                }}
                whileHover={{ x: 4 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 13,
                    color: "var(--fg-subtle)",
                    fontWeight: 500,
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    fontSize: "clamp(1.1rem, 1.6vw, 1.45rem)",
                    fontWeight: 400,
                    color: "var(--fg)",
                    letterSpacing: "-0.012em",
                    lineHeight: 1.4,
                  }}
                >
                  {task}
                </span>
              </motion.li>
            </Reveal>
          ))}
        </ol>

        <Reveal delay={0.4}>
          <p
            style={{
              marginTop: 56,
              fontSize: "clamp(1.05rem, 1.3vw, 1.3rem)",
              lineHeight: 1.55,
              color: "var(--fg)",
              maxWidth: 600,
              fontWeight: 500,
              letterSpacing: "-0.015em",
            }}
          >
            {t.rich("conclusion", {
              accent: (chunks) => (
                <span
                  style={{
                    color: "hsl(var(--primary))",
                    fontWeight: 600,
                  }}
                >
                  {chunks}
                </span>
              ),
            })}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
