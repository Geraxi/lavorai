"use client";

import {
  Zap,
  FileText,
  Mail,
  BarChart3,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { Reveal, RevealItem, RevealStagger } from "@/components/reveal";

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const features: Feature[] = [
  {
    icon: Zap,
    title: "Auto-Apply 24/7",
    body: "LavorAI scansiona 100+ portali italiani e internazionali e si candida per te agli annunci che matchano le tue preferenze. Tu dormi, le candidature partono.",
  },
  {
    icon: FileText,
    title: "CV Builder AI",
    body: "Carica il tuo CV o fallo generare da zero dal tuo profilo LinkedIn. Output ATS-friendly in DOCX e PDF, formato europeo moderno.",
  },
  {
    icon: Mail,
    title: "Cover Letter AI",
    body: "Lettera motivazionale in italiano nativo adattata ad ogni annuncio — non tradotta dall'inglese. Stile professionale o informale, scegli tu.",
  },
  {
    icon: Target,
    title: "ATS Optimizer",
    body: "Ogni CV generato è ottimizzato per passare i sistemi ATS usati dall'80% delle aziende medio-grandi. Keyword naturali, no stuffing.",
  },
  {
    icon: BarChart3,
    title: "Job Tracker",
    body: "Dashboard con tutte le candidature, stato, match score, risposte dei recruiter. Analytics chiare: tasso di visualizzazione, colloqui, tempo risparmiato.",
  },
  {
    icon: Sparkles,
    title: "Preferenze granulari",
    body: "Ruoli, città, RAL minima, remoto/ibrido/in sede, seniority, lingue, aziende da evitare. LavorAI candida SOLO dove vuoi davvero.",
  },
];

export function SectionFeatures() {
  return (
    <section
      id="features"
      className="relative border-t border-border/60 py-24 md:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.05),transparent_60%)]"
      />
      <div className="container relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            Cosa puoi fare
          </p>
          <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Tutto quello che ti serve per{" "}
            <span className="text-gradient-accent">vincere il prossimo colloquio.</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Un copilota AI completo: non solo auto-apply, ma CV builder,
            cover letter, ATS optimizer e tracking in una sola app.
          </p>
        </Reveal>

        <RevealStagger
          staggerDelay={0.08}
          className="mx-auto mt-16 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map(({ icon: Icon, title, body }) => (
            <RevealItem key={title}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="group relative h-full rounded-2xl border border-border/70 bg-card/40 p-6 backdrop-blur-sm"
                style={{
                  boxShadow:
                    "0 1px 0 hsl(var(--foreground) / 0.04) inset, 0 10px 30px -12px hsl(var(--foreground) / 0.14)",
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(var(--primary)/0.25), transparent 40%, hsl(var(--primary)/0.10))",
                    padding: 1,
                    WebkitMask:
                      "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                  }}
                />

                <div className="relative">
                  <div
                    className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30"
                    style={{
                      background:
                        "linear-gradient(145deg, hsl(var(--primary) / 0.22), hsl(var(--primary) / 0.05))",
                      boxShadow:
                        "0 1px 0 hsl(var(--primary) / 0.25) inset, 0 6px 16px -4px hsl(var(--primary) / 0.30)",
                    }}
                  >
                    <Icon className="h-5 w-5 text-primary" strokeWidth={2.2} />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </motion.div>
            </RevealItem>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}
