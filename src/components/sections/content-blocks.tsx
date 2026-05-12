"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/reveal";
import {
  PERSONAS,
  WHY_NOT_CHATGPT,
  POST_SIGNUP_STEPS,
} from "@/lib/marketing-content";

/**
 * 3 sezioni content-strategy stackate in un singolo file per ridurre
 * boilerplate: target personas / differenza vs ChatGPT / cosa succede
 * dopo signup. Tutte SEO-friendly, conversion-aware.
 */

/* -------------------- Personas -------------------- */
export function SectionPersonas() {
  const t = useTranslations("personas");
  return (
    <section
      id="per-chi"
      className="relative border-t border-border/60 py-24 md:py-28"
    >
      <div className="container">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p
            className="mono text-[10.5px] uppercase tracking-[0.32em] text-primary/80"
            style={{ fontWeight: 500 }}
          >
            {t("eyebrow")}
          </p>
          <h2
            className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            {t("title1")}{" "}
            <span className="text-gradient-accent">{t("title2")}</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">{t("subtitle")}</p>
        </Reveal>

        {/* People-grid hero image — mostra la diversità target prima
            ancora di leggere i 4 personas testuali. Crop con border
            radius generoso + leggera overlay verde per fonderla col
            theme. Asset: /people-grid.jpg (gruppo di professionisti
            di settori diversi: medici, ingegneri, operai, chef,
            insegnanti, sviluppatori, ecc.).
            Aspect ratio 3/2 → matcha il crop naturale di una foto
            di gruppo orizzontale senza tagliare teste o piedi. */}
        <Reveal delay={0.12} className="mx-auto mt-12 max-w-5xl">
          <div
            style={{
              position: "relative",
              borderRadius: "2rem",
              overflow: "hidden",
              aspectRatio: "3 / 2",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow:
                "0 2px 6px rgba(5,80,55,0.20), 0 24px 60px -16px rgba(5,80,55,0.40)",
              background: "rgba(5,80,55,0.20)",
            }}
          >
            <Image
              src="/people-grid.jpg"
              alt="Professionisti italiani di ogni settore: medici, designer, sviluppatori, insegnanti, operai, chef, vigili del fuoco, ingegneri e altri"
              fill
              priority={false}
              sizes="(max-width: 1024px) 100vw, 960px"
              style={{
                objectFit: "cover",
                objectPosition: "center 35%",
              }}
            />
            {/* Overlay gradient: sfuma in verde su entrambi i bordi
                così l'immagine si integra col theme verde + un velo
                centrale scuro per leggibilità della caption sotto. */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, transparent 50%, rgba(5,80,55,0.45) 100%), linear-gradient(90deg, rgba(5,80,55,0.30) 0%, transparent 15%, transparent 85%, rgba(5,80,55,0.30) 100%)",
                pointerEvents: "none",
              }}
            />
            {/* Caption finale per riportare narrative all'human level */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "20px 28px",
                color: "#FFFFFF",
                fontSize: "clamp(0.95rem, 1.1vw, 1.1rem)",
                fontWeight: 500,
                letterSpacing: "-0.012em",
                textShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            >
              {t("imageCaption")}
            </div>
          </div>
        </Reveal>

        <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2">
          {PERSONAS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.04}>
              <article
                style={{
                  height: "100%",
                  padding: 24,
                  borderRadius: 12,
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border-ds)",
                }}
              >
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                    lineHeight: 1.3,
                  }}
                >
                  {p.title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "var(--fg-muted)",
                    marginTop: 8,
                    marginBottom: 0,
                  }}
                >
                  {p.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------- Why-not-ChatGPT -------------------- */
export function SectionWhyNotChatGpt() {
  const t = useTranslations("whyNotChatGpt");
  return (
    <section
      id="vs-chatgpt"
      className="relative border-t border-border/60 py-24 md:py-28"
      style={{ background: "var(--bg-sunken)" }}
    >
      <div className="container">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p
            className="mono text-[10.5px] uppercase tracking-[0.32em] text-primary/80"
            style={{ fontWeight: 500 }}
          >
            {t("eyebrow")}
          </p>
          <h2
            className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            {t("title1")}{" "}
            <span className="text-gradient-accent">{t("title2")}</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">{t("subtitle")}</p>
        </Reveal>

        <div className="mx-auto mt-12 max-w-4xl flex flex-col gap-3">
          {WHY_NOT_CHATGPT.map((row, i) => (
            <Reveal key={row.title} delay={i * 0.04}>
              <article
                style={{
                  padding: 20,
                  borderRadius: 12,
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border-ds)",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 16,
                  alignItems: "flex-start",
                }}
              >
                <div
                  className="mono"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "hsl(var(--primary) / 0.12)",
                    color: "hsl(var(--primary))",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                      lineHeight: 1.3,
                    }}
                  >
                    {row.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "var(--fg-muted)",
                      marginTop: 6,
                      marginBottom: 0,
                    }}
                  >
                    {row.body}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------- After signup -------------------- */
export function SectionAfterSignup() {
  const t = useTranslations("afterSignup");
  return (
    <section
      id="cosa-dopo"
      className="relative border-t border-border/60 py-24 md:py-28"
    >
      <div className="container">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p
            className="mono text-[10.5px] uppercase tracking-[0.32em] text-primary/80"
            style={{ fontWeight: 500 }}
          >
            {t("eyebrow")}
          </p>
          <h2
            className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            {t("title1")}{" "}
            <span className="text-gradient-accent">{t("title2")}</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">{t("subtitle")}</p>
        </Reveal>

        <ol
          className="mx-auto mt-14 max-w-3xl flex flex-col gap-2"
          style={{ listStyle: "none", padding: 0, margin: "56px auto 0" }}
        >
          {POST_SIGNUP_STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.04}>
              <li
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 18,
                  alignItems: "center",
                  padding: "18px 22px",
                  borderRadius: 12,
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border-ds)",
                }}
              >
                <div
                  className="mono"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    background: "var(--bg)",
                    color: "var(--fg)",
                    border: "1px solid var(--border-ds)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {i + 1}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      letterSpacing: "-0.012em",
                    }}
                  >
                    {s.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--fg-muted)",
                      marginTop: 2,
                      lineHeight: 1.55,
                    }}
                  >
                    {s.body}
                  </div>
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    color: "var(--fg-subtle)",
                    fontWeight: 500,
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {s.duration}
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------- Referral placeholder -------------------- */
export function SectionReferral() {
  const t = useTranslations("referral");
  return (
    <section
      id="referral"
      className="relative border-t border-border/60 py-16"
    >
      <div className="container">
        <Reveal className="mx-auto max-w-3xl">
          <div
            style={{
              padding: "24px 28px",
              borderRadius: 14,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "var(--fg-subtle)",
                fontWeight: 500,
              }}
            >
              {t("eyebrow")}
            </span>
            <h3
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.022em",
                lineHeight: 1.25,
                margin: 0,
              }}
            >
              {t("title")}
            </h3>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--fg-muted)",
                margin: 0,
                maxWidth: 640,
              }}
            >
              {t("body")}
            </p>
            {/*
              PLACEHOLDER: il bottone è un mailto. Sostituire con form
              waitlist (Resend / typeform) quando il flow referral è
              implementato. Vedi TODO-LAUNCH.md.
            */}
            <a
              href="mailto:hello@lavorai.it?subject=Referral%20beta%20waitlist"
              className="ds-btn ds-btn-primary"
              style={{
                fontSize: 14,
                padding: "9px 18px",
                fontWeight: 600,
              }}
            >
              {t("cta")} →
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
