"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
// Image import non più necessario — l'immagine pianeta è ora bg
// CSS della section, non un <Image> renderizzato.
import { trackEvent, AnalyticsEvent } from "@/lib/analytics";
import { LiveStatsBadge } from "@/components/live-stats-badge";

export function Hero() {
  const t = useTranslations("hero");
  return (
    <section
      className="lavorai-hero-section relative overflow-hidden"
      style={{
        backgroundColor: "#010510",
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* Desktop (lg+): planet ruota a destra come sfondo full-section.
          Su mobile non lo mostriamo qui — il testo occuperebbe tutto
          il width e coprirebbe il pianeta. Vedi il blocco mobile sotto. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 hidden lg:block"
        style={{
          backgroundImage: "url('/Lavoraiherosection.png')",
          // Image fitting: ora 80% size + margine 40px sia a destra che
          // verticalmente. Niente più crop su nessun lato, sia per il
          // sizing che per la micro scale-animation (max 1.02).
          //   - size 80%: lascia ~10% bezel orizzontale per non toccare
          //     mai i bordi laterali (anche con scale 1.02).
          //   - position "right 40px center": ancora 40px dal bordo destro
          //     così c'è respiro tra il pianeta e l'edge del viewport.
          //   - transformOrigin centro: ora che c'è margine, la scale
          //     può animarsi simmetricamente senza creare crop laterali.
          // Iterazione 4: vincolare l'altezza dell'immagine alla section
          // (auto 88%) garantisce che la sfera entra SEMPRE verticalmente
          // anche se il viewport cambia altezza. L'immagine è 766x765
          // (quadrata) → 88% di altezza section = anche larghezza
          // proporzionata, niente clipping orizzontale.
          backgroundSize: "auto 88%",
          // Right 20px + top 4%: pianeta in alto-destra con micro-margine
          // su entrambi i lati così niente edge viene mai toccato dal
          // micro respiro di scale.
          backgroundPosition: "right 20px top 4%",
          backgroundRepeat: "no-repeat",
          transformOrigin: "85% 20%",
        }}
        animate={{
          rotate: [0, 1, -1, 0],
          scale: [1.0, 1.02, 1.02, 1.0],
        }}
        transition={{
          duration: 18,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />

      {/* Mobile (<lg): pianeta visibile come "top hero" sopra il testo.
          Niente rotazione (mantenere CPU + battery basso su device piccoli),
          centrato sopra il blocco testo. Text container ha pt extra
          (vedi sotto) per non sovrapporsi. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 block lg:hidden"
        style={{
          height: 320,
          backgroundImage: "url('/Lavoraiherosection.png')",
          backgroundSize: "auto 100%",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
          opacity: 0.95,
        }}
      />

      {/* Soft gradient — su desktop sfuma il bordo sinistro per blendare
          il pianeta col nero; su mobile sfuma il bordo INFERIORE del
          pianeta nel resto della section. Due gradient compositi. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 hidden lg:block"
        style={{
          background:
            "linear-gradient(90deg, #010510 0%, rgba(1,5,16,0.8) 40%, rgba(1,5,16,0) 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 block lg:hidden"
        style={{
          height: 340,
          background:
            "linear-gradient(180deg, transparent 0%, transparent 55%, rgba(1,5,16,0.6) 80%, #010510 100%)",
        }}
      />

      {/* Subtle green atmospheric glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 40% 50% at 75% 50%, hsl(var(--primary) / 0.15), transparent 70%)",
          mixBlendMode: "screen",
        }}
        animate={{
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 8,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />

      <div
        className="relative z-10 w-full"
        style={{
          maxWidth: 1480,
          margin: "0 auto",
          padding: "24px 40px",
        }}
      >
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* Colonna sinistra: Testo puro su dark background, senza box glassmorphism */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            // pt-[280px] su mobile spinge il testo SOTTO il pianeta-hero
            // (alto 320px nel blocco bg di sopra) — su desktop torna a
            // pt-10 perché il pianeta è laterale, non sovrastante.
            className="flex flex-col items-start text-left relative z-10 w-full lg:max-w-[640px] pt-[280px] pb-8 lg:pt-4 lg:pb-6"
          >
            {/* Badge live — stats REALI dal DB via /api/public/stats.
                Se il fetch fallisce o gli stats sono a zero, non renderizza
                nulla (no "0 utenti" imbarazzante). Sostituisce il badge
                hardcoded precedente. */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-3"
            >
              <LiveStatsBadge variant="hero" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="text-balance font-bold tracking-tight"
              style={{
                // Misura "base" = quella di LavorAI (l'ultima riga).
                // Le righe precedenti sono in em per scalare in proporzione.
                // Max ridotto da 7.5rem a 6rem così le 4 righe + content
                // sotto stanno tutte nella section senza scroll/crop.
                fontSize: "clamp(2.25rem, 4.2vw, 4.5rem)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
                fontWeight: 800,
                color: "#FFFFFF",
                textShadow: "0 2px 24px rgba(0,5,20,0.5)",
              }}
            >
              {/* H1 promise-driven: chi arriva capisce in 2 secondi COSA
                  fa il prodotto — no più wordplay poetico. Il claim finale
                  ("LavorAI") resta col glow verde per il brand. */}
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.05 }}
                style={{
                  display: "block",
                  fontSize: "0.82em",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                }}
              >
                {t("titleLineA")}
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.15 }}
                style={{
                  display: "block",
                  fontSize: "0.82em",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                  marginTop: "0.04em",
                }}
              >
                {t("titleLineB")}
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  display: "block",
                  color: "hsl(var(--primary))",
                  textShadow: "0 0 40px hsl(var(--primary)/0.35)",
                  marginTop: "0.14em",
                  fontSize: "0.95em",
                }}
              >
                {t("titleBrand")}
              </motion.span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
              className="mt-3 max-w-[520px]"
              style={{
                fontSize: "clamp(0.9rem, 1vw, 1rem)",
                lineHeight: 1.5,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              {t("subtitleV2")}
            </motion.p>

            {/* Garanzia rimborso — proof of confidence, sostituisce
                bisogno di testimonial fake. Il founder ci mette i soldi. */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.28 }}
              className="mt-3 inline-flex items-start gap-2 rounded-lg px-3 py-1.5"
              style={{
                background: "hsl(var(--primary) / 0.08)",
                borderLeft: "3px solid hsl(var(--primary))",
                maxWidth: 520,
                fontSize: 12,
                lineHeight: 1.45,
                color: "rgba(255,255,255,0.85)",
              }}
            >
              <span
                aria-hidden
                style={{ color: "hsl(var(--primary))", fontWeight: 700, fontSize: 15, lineHeight: 1 }}
              >
                🛡
              </span>
              <span>
                <strong style={{ color: "#fff" }}>{t("guaranteeLabel")}</strong>{" "}
                {t("guaranteeText")}
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.35 }}
              className="mt-4 flex flex-col items-start gap-3 w-full"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  className="group relative overflow-hidden bg-primary text-primary-foreground hover:bg-primary/90"
                  style={{
                    minHeight: 44,
                    paddingLeft: 20,
                    paddingRight: 20,
                    fontSize: 14.5,
                    fontWeight: 600,
                    borderRadius: 10,
                  }}
                >
                  <Link href="/signup" onClick={() => trackEvent(AnalyticsEvent.HERO_CTA_PRIMARY, { label: "signup" })}>
                    <span className="relative z-10">{t("ctaPrimaryV2")}</span>
                  </Link>
                </Button>
                <Link
                  href="/analizza-cv"
                  onClick={() => trackEvent(AnalyticsEvent.HERO_CTA_SECONDARY, { label: "lead_magnet" })}
                  className="ds-btn"
                  style={{
                    minHeight: 52,
                    paddingLeft: 24,
                    paddingRight: 24,
                    fontSize: 16,
                    fontWeight: 600,
                    background: "#FFFFFF",
                    color: "#000000",
                    borderRadius: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {t("ctaSecondaryV2")}
                </Link>
              </div>
              
              {/* Checkmarks row + Product Hunt badge inline — compatto */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2" style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>
                {[t("checkA"), t("checkB"), t("checkC")].map((text) => (
                  <span key={text} className="inline-flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    {text}
                  </span>
                ))}
                <a
                  href="https://www.producthunt.com/products/lavorai-it?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-lavorai-it"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                  style={{ lineHeight: 0 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Lavorai.it - AI-powered auto apply for job seekers | Product Hunt"
                    width={170}
                    height={37}
                    src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1151760&theme=light&t=1779546633084"
                  />
                </a>
              </div>

            </motion.div>
          </motion.div>

          {/* Right column: deliberatamente vuota su desktop — l'immagine
              pianeta è ora background della section, lascia che si
              veda. La colonna sinistra resta per il copy con dark
              overlay come scrim. */}
          <div className="hidden lg:block" aria-hidden />
        </div>

        <div className="mt-10 mb-4" />
      </div>
    </section>
  );
}

// Live-activity Counter + Product Hunt badge + 4-icon trust strip
// rimossi dall'hero (troppo per stare above-the-fold). Vivono più
// in basso nella landing.
