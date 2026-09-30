"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, Check, FileText, MapPin, Send, Sparkles } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { trackEvent, AnalyticsEvent } from "@/lib/analytics";
import { LiveStatsBadge } from "@/components/live-stats-badge";
import { JobNetworkScene } from "@/components/job-network-scene";
import "@/components/job-network-scene.css";

export function Hero() {
  const t = useTranslations("hero");
  const heroRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end end"] });
  const railScale = useTransform(scrollYProgress, [0, 1], [0.08, 1]);
  return (
    <>
    <section
      ref={heroRef}
      className="lavorai-hero-section relative min-h-[780px] lg:min-h-[150svh]"
      style={{
        backgroundColor: "transparent",
      }}
    >
      <div className="relative min-h-[780px] overflow-hidden lg:sticky lg:top-0 lg:h-[100svh]">
      {/* La composizione vive interamente nella metà destra: la Terra e le
          opportunità sono un unico soggetto, mentre il copy resta libero a
          sinistra. Il pianeta condiviso riappare più avanti nello scroll. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 hidden lg:block"
        style={{
          backgroundImage: "url('/lavorai-hero-space.jpg')",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 hidden lg:block"
        style={{
          background:
            "linear-gradient(90deg, #010510 0%, rgba(1,5,16,0.92) 34%, rgba(1,5,16,0.28) 54%, rgba(1,5,16,0) 76%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 block lg:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(1,5,16,0.18) 0%, rgba(1,5,16,0.08) 30%, #010510 78%)",
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

      <JobNetworkScene hero showGlobe={false} />


      <div
        className="relative z-10 flex min-h-[780px] w-full items-center lg:h-full lg:min-h-0"
        style={{
          maxWidth: 1580,
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
            // Su mobile lasciamo spazio al pianeta condiviso, che è già
            // presente dal primo frame e continua lungo tutta la landing.
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
                fontSize: "clamp(2.7rem, 5.35vw, 5.7rem)",
                letterSpacing: "-0.055em",
                lineHeight: 0.98,
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
                <span style={{ color: "hsl(var(--primary))", textShadow: "0 0 40px hsl(var(--primary)/0.35)" }}>LavorAI</span>{t("titleLineB")}
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  display: "block",
                  color: "#FFFFFF",
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
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.35 }}
              className="mt-7 flex flex-col items-start gap-6 w-full"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  className="group relative overflow-hidden bg-primary text-primary-foreground hover:bg-primary/90"
                  style={{
                    minHeight: 64,
                    minWidth: 304,
                    paddingLeft: 30,
                    paddingRight: 30,
                    fontSize: 17,
                    fontWeight: 600,
                    borderRadius: 14,
                  }}
                >
                  <Link href="/signup" onClick={() => trackEvent(AnalyticsEvent.HERO_CTA_PRIMARY, { label: "signup" })}>
                    <span className="relative z-10 inline-flex items-center gap-7">{t("ctaPrimaryV2")} <ArrowRight size={21} /></span>
                  </Link>
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-7 text-white/80" style={{ maxWidth: 440 }}>
                {[
                  [FileText, t("featureA")],
                  [MapPin, t("featureB")],
                  [Sparkles, t("featureC")],
                ].map(([Icon, label]) => {
                  const FeatureIcon = Icon as typeof FileText;
                  return <div key={String(label)} className="space-y-2 text-[13px] font-medium leading-snug"><FeatureIcon className="text-primary" size={22} strokeWidth={1.8} /><span className="block whitespace-pre-line">{String(label)}</span></div>;
                })}
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

      <div aria-hidden className="pointer-events-none absolute bottom-7 left-1/2 z-20 hidden w-[min(440px,36vw)] -translate-x-1/2 lg:block">
        <div className="mb-2 flex justify-between font-mono text-[9px] tracking-[0.22em] text-white/45"><span>01 / START</span><span>YOUR NEXT ROLE</span></div>
        <div className="h-px bg-white/20"><motion.span className="block h-px origin-left bg-primary" style={reducedMotion ? { width: "100%" } : { scaleX: railScale }} /></div>
      </div>
      </div>
    </section>
    <section className="relative overflow-hidden bg-[#010510] px-5 pb-24 pt-20 sm:px-8 lg:px-10 lg:pb-32 lg:pt-28">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(ellipse 48% 58% at 50% 47%, hsl(var(--primary) / 0.12), transparent 72%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      <div className="relative mx-auto max-w-[1240px]">
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mb-11 max-w-2xl text-center lg:mb-16"
        >
          <div className="mb-4 inline-flex items-center gap-2 border border-primary/25 bg-primary/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary"><Sparkles size={13} /> Una candidatura, costruita per quel ruolo</div>
          <h2 className="text-balance text-4xl font-semibold tracking-[-0.055em] text-white sm:text-5xl">Non inviamo il tuo CV.<br /><span className="text-primary">Lo rendiamo pertinente.</span></h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/60">Ogni candidatura mette insieme ruolo, azienda, luogo di lavoro e le esperienze che contano davvero per quella posizione.</p>
        </motion.div>

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 34 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.12 }}
          transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="grid gap-4 lg:grid-cols-[1.38fr_.72fr]"
        >
          <article className="relative overflow-hidden border border-white/15 bg-[#08151a] p-5 shadow-[0_32px_100px_rgba(0,0,0,.45)] sm:p-7">
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center border border-primary/30 bg-primary/10 text-primary"><BriefcaseBusiness size={20} /></div>
                <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Candidatura pronta</p><h3 className="mt-1 text-xl font-medium tracking-[-0.035em] text-white sm:text-2xl">Lifecycle Marketing Manager</h3><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/55"><span>Klaviyo</span><span className="text-white/20">•</span><span className="inline-flex items-center gap-1"><MapPin size={13} /> Londra · Ibrido</span></div></div>
              </div>
              <div className="border border-primary/30 bg-primary/10 px-3 py-2 text-right"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">compatibilità</p><p className="mt-0.5 text-2xl font-medium tracking-[-0.06em] text-white">92<span className="ml-1 text-xs text-white/45">/100</span></p></div>
            </div>

            <div className="grid gap-5 py-6 sm:grid-cols-[1fr_.82fr]">
              <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">CV adattato a questa posizione</p><div className="mt-3 space-y-3">
                <DetailLine title="Priorità riscritte" text="Retention, lifecycle e segmentazione in primo piano." />
                <DetailLine title="Risultati selezionati" text="Le metriche che dimostrano impatto, non un elenco generico." />
                <DetailLine title="Parole chiave allineate" text="Terminologia della job description integrata con naturalezza." />
              </div></div>
              <div className="border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between"><FileText size={17} className="text-primary" /><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">cv_lifecycle.pdf</span></div><div className="mt-5 space-y-2"><div className="h-1.5 w-4/5 bg-white/75" /><div className="h-1.5 w-full bg-white/30" /><div className="h-1.5 w-3/5 bg-primary/80" /><div className="h-1.5 w-11/12 bg-white/30" /><div className="h-1.5 w-2/3 bg-white/30" /></div><p className="mt-5 border-t border-white/10 pt-3 text-xs leading-relaxed text-white/55">Versione creata per Klaviyo, non un CV identico inviato ovunque.</p></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5"><span className="inline-flex items-center gap-2 text-sm text-white/70"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check size={12} strokeWidth={3} /></span>Pronta per l&apos;invio</span><span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Scopri come funziona <ArrowUpRight size={14} /></span></div>
          </article>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <motion.article whileHover={reducedMotion ? undefined : { y: -5 }} transition={{ duration: 0.2 }} className="border border-white/12 bg-[#061014] p-5 sm:p-6"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">Cosa controlla</span><span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_14px_hsl(var(--primary)/.9)]" /></div><p className="mt-6 text-4xl font-medium tracking-[-0.07em] text-white">03</p><p className="mt-1 text-sm text-white/60">segnali verificati prima di preparare la candidatura.</p><div className="mt-5 space-y-2.5 border-t border-white/10 pt-4 text-xs text-white/60"><CheckRow text="Ruolo e seniority" /><CheckRow text="Luogo e modalità di lavoro" /><CheckRow text="Esperienze davvero rilevanti" /></div></motion.article>
            <motion.article whileHover={reducedMotion ? undefined : { y: -5 }} transition={{ duration: 0.2 }} className="relative overflow-hidden border border-primary/25 bg-primary/10 p-5 sm:p-6"><div aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/15 blur-2xl" /><div className="relative"><Send size={18} className="text-primary" /><p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Tu mantieni il controllo</p><p className="mt-2 text-lg font-medium leading-snug tracking-[-0.035em] text-white">Ti chiediamo solo ciò che serve prima dell&apos;invio.</p><p className="mt-3 text-sm leading-relaxed text-white/60">Se una risposta dipende da te, la candidatura aspetta. Niente invii alla cieca.</p></div></motion.article>
          </div>
        </motion.div>
      </div>
    </section>
    </>
  );
}

function DetailLine({ title, text }: { title: string; text: string }) {
  return <div className="flex gap-3"><span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-primary/45 text-primary"><Check size={10} strokeWidth={3} /></span><p className="text-sm leading-relaxed text-white/60"><strong className="font-medium text-white/88">{title}</strong><br />{text}</p></div>;
}

function CheckRow({ text }: { text: string }) {
  return <div className="flex items-center gap-2"><Check size={13} className="text-primary" strokeWidth={3} /><span>{text}</span></div>;
}

// Live-activity Counter + Product Hunt badge + 4-icon trust strip
// rimossi dall'hero (troppo per stare above-the-fold). Vivono più
// in basso nella landing.
