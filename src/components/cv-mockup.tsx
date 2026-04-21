"use client";

import { motion } from "motion/react";
import { Check, Sparkles } from "lucide-react";

/**
 * CVMockup: rendering HTML realistico del CV generato dalla pipeline.
 * Non è un'immagine stock — è proprio il formato che l'utente riceve.
 * Pensato come "product mockup" nel hero.
 */
export function CVMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
      className="relative"
    >
      {/* Floating AI badge in alto */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="absolute -left-6 -top-4 z-20 flex items-center gap-2 rounded-full border border-primary/30 bg-card/90 px-3 py-1.5 text-xs backdrop-blur-sm shadow-primary-glow"
      >
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="font-medium">Ottimizzato con AI</span>
      </motion.div>

      {/* ATS score badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.5, duration: 0.5 }}
        className="absolute -right-4 top-12 z-20 rounded-xl border border-border/60 bg-card/95 p-3 backdrop-blur-sm shadow-xl"
      >
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          ATS Score
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-primary">92</span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
        <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-muted">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "92%" }}
            transition={{ delay: 1.7, duration: 0.8, ease: "easeOut" }}
            className="h-full bg-primary"
          />
        </div>
      </motion.div>

      {/* Paper CV mockup */}
      <div className="animate-float">
        <div
          className="relative w-full max-w-[420px] origin-top-left rounded-lg bg-white p-6 text-slate-900 shadow-2xl"
          style={{
            aspectRatio: "1 / 1.414",
            boxShadow:
              "0 30px 80px -20px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
          }}
        >
          {/* Header CV */}
          <div className="border-b border-slate-200 pb-3">
            <div className="text-lg font-bold tracking-tight text-slate-900">
              Marco Rossi
            </div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              marco.rossi@esempio.it · +39 333 1234567 · Milano, Italia
            </div>
          </div>

          {/* Section: Profilo */}
          <div className="mt-4">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-900">
              Profilo
            </div>
            <div className="mt-1.5 space-y-1">
              <div className="h-1.5 w-full rounded-sm bg-slate-200" />
              <div className="h-1.5 w-[88%] rounded-sm bg-slate-200" />
              <div className="h-1.5 w-[72%] rounded-sm bg-slate-200" />
            </div>
          </div>

          {/* Section: Esperienza */}
          <div className="mt-4">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-900">
              Esperienza Professionale
            </div>
            <div className="mt-2">
              <div className="text-[11px] font-semibold text-slate-900">
                Senior Product Designer
              </div>
              <div className="text-[9px] text-slate-500">
                Tech Company · Milano · 2022 — Presente
              </div>
              <div className="mt-1.5 space-y-1">
                <HighlightRow highlight />
                <HighlightRow />
                <HighlightRow highlight />
              </div>
            </div>
            <div className="mt-2.5">
              <div className="text-[11px] font-semibold text-slate-900">
                Product Designer
              </div>
              <div className="text-[9px] text-slate-500">
                Startup Srl · 2020 — 2022
              </div>
              <div className="mt-1.5 space-y-1">
                <HighlightRow />
                <HighlightRow highlight />
              </div>
            </div>
          </div>

          {/* Section: Skills */}
          <div className="mt-3">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-900">
              Competenze
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {["Figma", "UX Research", "Design Systems", "React"].map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-700"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating check badge bottom-left */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.9, duration: 0.5 }}
        className="absolute -bottom-4 left-8 z-20 flex items-center gap-2 rounded-xl border border-border/60 bg-card/95 px-3 py-2 backdrop-blur-sm shadow-xl"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15">
          <Check className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <div className="text-[11px] font-medium leading-tight">
            CV + Cover letter
          </div>
          <div className="text-[10px] text-muted-foreground">
            DOCX pronti in 30s
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function HighlightRow({ highlight = false }: { highlight?: boolean }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 text-[8px] text-slate-400">•</span>
      <div className="flex flex-1 gap-1">
        <div className="h-1.5 flex-1 rounded-sm bg-slate-200" />
        {highlight && (
          <div className="h-1.5 w-10 rounded-sm bg-primary/70" />
        )}
        <div className="h-1.5 w-6 rounded-sm bg-slate-200" />
      </div>
    </div>
  );
}
