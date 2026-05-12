"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { PaywallDialog } from "@/components/paywall-dialog";
import { cleanHtmlText } from "@/lib/scrapers/html-clean";
import type { JobRow } from "@/components/jobs-list";

/**
 * Tinder-style swipe card stack per i job recommendation.
 *  - Drag right + drop oltre soglia → applica
 *  - Drag left + drop oltre soglia → skip (persisted in localStorage)
 *  - Click su "Skip" / "Apply" → stessa azione, animazione triggerata
 *  - Arrow keyboard ← → → equivalente click
 *
 * Stack visivo: 1 card in primo piano + 2 dietro (z-index decrescente)
 * per dare profondità e suggerire che ci sono altre opportunità.
 *
 * Persistenza skip: localStorage chiave `lavorai-skipped-jobs` (per-device).
 * Apply usa lo stesso endpoint di /jobs (`/api/applications/apply`).
 */

const SWIPE_THRESHOLD = 100; // px di drag minimo per triggare l'action
const SKIP_KEY = "lavorai-skipped-jobs";
const SAVED_KEY = "lavorai-saved-jobs";

function loadSaved(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistSaved(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(set).slice(-500)));
  } catch {
    /* quota */
  }
}

function portalOf(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("greenhouse")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("workable.com")) return "workable";
  if (u.includes("ashbyhq.com")) return "ashby";
  if (u.includes("smartrecruiters.com")) return "smartrecruiters";
  if (u.includes("linkedin")) return "linkedin";
  return "other";
}

function loadSkipped(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SKIP_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSkipped(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    // Cap a 500 elementi: oltre, droppiamo i più vecchi (FIFO)
    const arr = Array.from(set).slice(-500);
    localStorage.setItem(SKIP_KEY, JSON.stringify(arr));
  } catch {
    /* quota / private mode */
  }
}

export function JobSwiper({ jobs }: { jobs: JobRow[] }) {
  const t = useTranslations("discoverPage");
  const router = useRouter();
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [animDir, setAnimDir] = useState<"left" | "right" | null>(null);
  const [detailJob, setDetailJob] = useState<JobRow | null>(null);

  // Carica skipped da localStorage solo lato client per evitare hydration mismatch
  useEffect(() => {
    setSkipped(loadSkipped());
    setSaved(loadSaved());
  }, []);

  const toggleSave = useCallback(
    (jobId: string, title: string) => {
      setSaved((prev) => {
        const next = new Set(prev);
        if (next.has(jobId)) {
          next.delete(jobId);
          toast("Rimosso dai preferiti");
        } else {
          next.add(jobId);
          toast.success(`Salvato: ${title}`);
        }
        persistSaved(next);
        return next;
      });
    },
    [],
  );

  const queue = useMemo(
    () => jobs.filter((j) => !skipped.has(j.id)),
    [jobs, skipped],
  );

  const currentJob = queue[0];
  const peekJobs = queue.slice(1, 3); // 2 card di profondità

  // Skip programmaticamente (anche da bottone o swipe)
  const skip = useCallback(
    (jobId: string) => {
      setAnimatingId(jobId);
      setAnimDir("left");
      setTimeout(() => {
        setSkipped((prev) => {
          const next = new Set(prev);
          next.add(jobId);
          saveSkipped(next);
          return next;
        });
        setAnimatingId(null);
        setAnimDir(null);
      }, 250);
    },
    [],
  );

  // Apply: stessa logica di JobsList ma scoped al singolo
  const apply = useCallback(
    async (job: JobRow) => {
      setAnimatingId(job.id);
      setAnimDir("right");
      try {
        const res = await fetch("/api/applications/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, portal: portalOf(job.url) }),
        });
        const body = await res.json().catch(() => ({}));

        if (res.status === 409 && body?.error === "missing_cv") {
          toast.error(t("uploadCvFirst"));
          router.push("/onboarding");
          return;
        }
        if (res.status === 402) {
          setPaywallMessage(body?.message ?? null);
          setPaywallOpen(true);
          // Reset animation
          setAnimatingId(null);
          setAnimDir(null);
          return;
        }
        if (!res.ok) {
          toast.error(body?.message ?? t("retryError"));
          setAnimatingId(null);
          setAnimDir(null);
          return;
        }
        toast.success(t("applied", { title: job.title }));
        // Anche se è stato applicato lo aggiungo a skipped per non rivederlo
        setTimeout(() => {
          setSkipped((prev) => {
            const next = new Set(prev);
            next.add(job.id);
            saveSkipped(next);
            return next;
          });
          setAnimatingId(null);
          setAnimDir(null);
        }, 250);
      } catch {
        toast.error(t("networkError"));
        setAnimatingId(null);
        setAnimDir(null);
      }
    },
    [t, router],
  );

  // Keyboard navigation (disabilitato quando il drawer dettagli è aperto)
  useEffect(() => {
    if (!currentJob) return;
    const onKey = (e: KeyboardEvent) => {
      if (animatingId || detailJob) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        apply(currentJob);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skip(currentJob.id);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setDetailJob(currentJob);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentJob, animatingId, detailJob, apply, skip]);

  if (!currentJob) {
    const hasSkipped = skipped.size > 0;
    const totalJobs = jobs.length;
    return (
      <div
        className="ds-section-card"
        style={{
          padding: "48px 32px",
          textAlign: "center",
          borderRadius: 20,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 14 }}>🎯</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.01em" }}>
          {totalJobs === 0 ? "Nessuna offerta trovata" : "Hai visto tutte le offerte"}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--fg-muted)",
            maxWidth: 440,
            margin: "0 auto 24px",
            lineHeight: 1.55,
          }}
        >
          {totalJobs === 0
            ? "Nessun annuncio corrisponde alle tue preferenze attuali. Allarga ruoli, città o tipologia di contratto per scoprire altre opportunità."
            : `Hai esaminato tutte le ${totalJobs} offerte allineate al tuo profilo. Allarga le preferenze per nuovi match, oppure resetta gli skip per riprovare quelli scartati.`}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxWidth: 380,
            margin: "0 auto",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/preferences")}
            className="ds-btn ds-btn-primary"
            style={{
              padding: "12px 18px",
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Icon name="filter" size={14} />
            Modifica preferenze (ruoli, città, salario)
          </button>

          <button
            type="button"
            onClick={() => router.push("/jobs")}
            className="ds-btn"
            style={{
              padding: "11px 18px",
              fontSize: 13.5,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Icon name="search" size={13} />
            Cerca manualmente su /jobs
          </button>

          {hasSkipped && (
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(SKIP_KEY);
                setSkipped(new Set());
                toast.success(`Ripristinati ${skipped.size} annunci scartati`);
              }}
              className="ds-btn"
              style={{
                padding: "11px 18px",
                fontSize: 13.5,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Icon name="refresh" size={13} />
              Ripristina gli {skipped.size} skip
            </button>
          )}
        </div>

        <div
          style={{
            marginTop: 24,
            fontSize: 11.5,
            color: "var(--fg-subtle)",
            lineHeight: 1.5,
          }}
        >
          Il cron sync-jobs pesca nuovi annunci ogni 2 ore.
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 540,
          marginTop: 8,
        }}
      >
        {/* Peek cards dietro */}
        {peekJobs.map((j, i) => (
          <PeekCard key={j.id} job={j} depth={i + 1} />
        ))}

        {/* Card attiva con drag */}
        <SwipeCard
          key={currentJob.id}
          job={currentJob}
          isAnimatingOut={animatingId === currentJob.id}
          animDir={animDir}
          isSaved={saved.has(currentJob.id)}
          onToggleSave={() => toggleSave(currentJob.id, currentJob.title)}
          onSwipe={(dir) => {
            if (dir === "right") apply(currentJob);
            else skip(currentJob.id);
          }}
          onTap={() => setDetailJob(currentJob)}
        />
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 14,
          marginTop: 18,
        }}
      >
        <button
          type="button"
          onClick={() => skip(currentJob.id)}
          disabled={!!animatingId}
          aria-label={t("skip")}
          style={{
            width: 60,
            height: 60,
            borderRadius: 999,
            border: "1px solid var(--border-ds)",
            background: "var(--bg-elev)",
            color: "var(--fg-muted)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "transform 0.15s, background 0.15s",
            fontSize: 22,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          ✕
        </button>
        <button
          type="button"
          onClick={() => apply(currentJob)}
          disabled={!!animatingId}
          aria-label={t("apply")}
          style={{
            width: 60,
            height: 60,
            borderRadius: 999,
            border: "1px solid hsl(var(--primary) / 0.5)",
            background:
              "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.85))",
            color: "white",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "transform 0.15s, box-shadow 0.15s",
            boxShadow: "0 8px 24px hsl(var(--primary) / 0.35)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <Icon name="zap" size={22} />
        </button>
      </div>

      {/* Hint keyboard */}
      <div
        style={{
          marginTop: 14,
          textAlign: "center",
          fontSize: 11,
          color: "var(--fg-subtle)",
        }}
      >
        {t("hintKeyboard")}
      </div>

      {/* Counter */}
      <div
        style={{
          marginTop: 4,
          textAlign: "center",
          fontSize: 11.5,
          color: "var(--fg-muted)",
        }}
      >
        {t("queueRemaining", { count: queue.length })}
      </div>

      <PaywallDialog
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        variant="limit"
        sub={paywallMessage ?? undefined}
      />

      <JobDetailDrawer
        job={detailJob}
        onClose={() => setDetailJob(null)}
        onApply={(j) => {
          setDetailJob(null);
          apply(j);
        }}
        onSkip={(j) => {
          setDetailJob(null);
          skip(j.id);
        }}
        labels={{
          apply: t("apply"),
          skip: t("skip"),
          fullDescription: t("fullDescription"),
          openOriginal: t("openOriginal"),
        }}
      />
    </>
  );
}

/**
 * Card di sfondo (peek) — non interagibile, leggermente scalata e
 * spostata sotto per dare percezione di profondità.
 */
function PeekCard({ job, depth }: { job: JobRow; depth: number }) {
  // NB: niente opacity reduction. Avevamo `1 - depth * 0.35` per dare
  // profondità, ma durante l'animazione di swipe-out della card attiva
  // la peek card sottostante restava visibile al 65% di opacità per
  // ~250ms prima che la nuova SwipeCard montasse sopra — sembrava un
  // glitch di "card trasparente". Scale + yOffset bastano per la
  // percezione di stack senza causare il flash translucido.
  const scale = 1 - depth * 0.04;
  const yOffset = depth * 8;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${scale}) translateY(${yOffset}px)`,
        zIndex: 10 - depth,
        pointerEvents: "none",
      }}
    >
      <JobCardSurface job={job} compact />
    </div>
  );
}

/**
 * Card attiva con gestione drag/swipe via motion. Espone callback
 * `onSwipe('left' | 'right')` quando l'utente rilascia oltre la soglia.
 */
function SwipeCard({
  job,
  isAnimatingOut,
  animDir,
  isSaved,
  onToggleSave,
  onSwipe,
  onTap,
}: {
  job: JobRow;
  isAnimatingOut: boolean;
  animDir: "left" | "right" | null;
  isSaved: boolean;
  onToggleSave: () => void;
  onSwipe: (dir: "left" | "right") => void;
  onTap: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-14, 0, 14]);
  // Overlay verde/rosso che appare quando draggi
  const applyOverlayOpacity = useTransform(x, [0, 120], [0, 1]);
  const skipOverlayOpacity = useTransform(x, [-120, 0], [1, 0]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      onSwipe("right");
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      onSwipe("left");
    }
  }

  // Animazione di uscita post-azione (anche da bottone)
  const exitAnimation = isAnimatingOut
    ? {
        x: animDir === "right" ? 600 : animDir === "left" ? -600 : 0,
        rotate: animDir === "right" ? 25 : animDir === "left" ? -25 : 0,
        opacity: 0,
      }
    : {};

  return (
    <motion.div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        cursor: isAnimatingOut ? "default" : "grab",
        x,
        rotate,
      }}
      drag={isAnimatingOut ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={onDragEnd}
      onTap={isAnimatingOut ? undefined : onTap}
      animate={exitAnimation}
      transition={{ duration: 0.25, ease: "easeOut" }}
      whileTap={{ cursor: "grabbing" }}
    >
      <JobCardSurface job={job} isSaved={isSaved} onToggleSave={onToggleSave}>
        {/* Overlay "APPLY" verde quando draghi a destra */}
        <motion.div
          aria-hidden
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            padding: "8px 16px",
            border: "3px solid hsl(var(--primary))",
            color: "hsl(var(--primary))",
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: "0.08em",
            borderRadius: 8,
            transform: "rotate(-12deg)",
            opacity: applyOverlayOpacity,
            background: "hsl(var(--primary) / 0.1)",
            pointerEvents: "none",
          }}
        >
          APPLY ✨
        </motion.div>
        {/* Overlay "SKIP" rosso/grigio quando draghi a sinistra */}
        <motion.div
          aria-hidden
          style={{
            position: "absolute",
            top: 24,
            right: 24,
            padding: "8px 16px",
            border: "3px solid var(--fg-subtle)",
            color: "var(--fg-muted)",
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: "0.08em",
            borderRadius: 8,
            transform: "rotate(12deg)",
            opacity: skipOverlayOpacity,
            background: "var(--bg-sunken)",
            pointerEvents: "none",
          }}
        >
          SKIP
        </motion.div>
      </JobCardSurface>
    </motion.div>
  );
}

/**
 * Estrae il livello di seniority dal titolo per mostrarlo come pill.
 * Match case-insensitive su keyword comuni (head/staff > principal > lead
 * > senior > mid > junior).
 */
function seniorityFromTitle(title: string): string | null {
  const t = title.toLowerCase();
  if (/\bhead of\b|\bhead\b/.test(t)) return "Head";
  if (/\bstaff\b/.test(t)) return "Staff";
  if (/\bprincipal\b/.test(t)) return "Principal";
  if (/\blead\b/.test(t)) return "Lead";
  if (/\bsenior\b|\bsr\.?\b/.test(t)) return "Senior";
  if (/\bjunior\b|\bjr\.?\b|\bentry[\s-]?level\b/.test(t)) return "Junior";
  if (/\bintern\b|\binternship\b/.test(t)) return "Intern";
  if (/\bmid[\s-]?level\b/.test(t)) return "Mid";
  return null;
}

/**
 * "3d ago" / "Today" / "Yesterday" — pill di freshness.
 */
function relativeDateLabel(d: Date | null | undefined): string | null {
  if (!d) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Estrae 2-3 tech/skill keywords dalla description per mostrarli come
 * pill colorate. Whitelist ampia di skill tech comuni; ordina per
 * frequenza, cap a 3 pill per non affollare.
 */
const SKILL_VOCAB = [
  "React",
  "TypeScript",
  "JavaScript",
  "Node",
  "Python",
  "Go",
  "Rust",
  "Java",
  "Kotlin",
  "Swift",
  "Ruby",
  "PHP",
  "AWS",
  "GCP",
  "Azure",
  "Kubernetes",
  "Docker",
  "Terraform",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "GraphQL",
  "REST",
  "Next.js",
  "Vue",
  "Angular",
  "Figma",
  "Sketch",
  "Tailwind",
  "AI",
  "ML",
  "LLM",
  "SaaS",
  "B2B",
  "Fintech",
  "DevOps",
  "Frontend",
  "Backend",
  "Full-stack",
  "Mobile",
  "iOS",
  "Android",
  "UX",
  "UI",
];

function extractSkills(description: string): string[] {
  const clean = cleanHtmlText(description);
  const found = new Map<string, number>();
  for (const skill of SKILL_VOCAB) {
    const re = new RegExp(`\\b${skill.replace(".", "\\.")}\\b`, "gi");
    const matches = clean.match(re);
    if (matches && matches.length > 0) found.set(skill, matches.length);
  }
  return Array.from(found.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
}

/**
 * UI Tinder-style: minimal text, pill-heavy. Solo info strutturate,
 * niente paragrafi narrativi. Per la description completa l'utente
 * tocca la card → drawer.
 *
 * Anatomy:
 *   - Top: accent strip gradient (8px) per personalità visiva
 *   - Header: company logo grande + title (max 2 righe) + company
 *   - Pills cluster: remote, seniority, location, contract, salary, posted-date
 *   - Skills cluster: 2-3 tech keyword estratte automaticamente
 *   - Footer: "Tap for details" hint
 */
function JobCardSurface({
  job,
  compact,
  isSaved,
  onToggleSave,
  children,
}: {
  job: JobRow;
  compact?: boolean;
  isSaved?: boolean;
  onToggleSave?: () => void;
  children?: React.ReactNode;
}) {
  const color = companyColor(job.company ?? job.title);
  const seniority = useMemo(() => seniorityFromTitle(job.title), [job.title]);
  const skills = useMemo(
    () => (compact ? [] : extractSkills(job.description)),
    [job.description, compact],
  );
  const descSnippet = useMemo(() => {
    if (compact) return "";
    const clean = cleanHtmlText(job.description).replace(/\s+/g, " ").trim();
    return clean.length > 280 ? clean.slice(0, 280).trimEnd() + "…" : clean;
  }, [job.description, compact]);
  const postedLabel = relativeDateLabel(job.postedAt ?? null);
  const salaryLabel = (job.salaryMin || job.salaryMax) ? formatSalary(job.salaryMin, job.salaryMax) : null;

  return (
    <div
      style={
        {
          position: "relative",
          height: "100%",
          borderRadius: "2rem",
          border: "1px solid rgba(0,0,0,0.06)",
          // White card — pop su dark background, tono Tinder.
          background: "#FFFFFF",
          color: "#0F1012",
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.18), 0 32px 80px -16px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          userSelect: compact ? "none" : "auto",
          // Override CSS vars per cascade dark-on-white nel contenuto.
          "--fg": "#0F1012",
          "--fg-muted": "rgba(15,16,18,0.65)",
          "--fg-subtle": "rgba(15,16,18,0.42)",
          "--border-ds": "rgba(15,16,18,0.10)",
          "--bg-elev": "rgba(15,16,18,0.04)",
          "--bg-sunken": "rgba(15,16,18,0.06)",
        } as React.CSSProperties
      }
    >
      {/* Brand banner: gradient col company color, logo centrato.
          Sostituisce la "photo" stile Tinder con un'identità visiva
          deterministica derivata dal nome azienda. */}
      <div
        aria-hidden
        style={{
          position: "relative",
          height: compact ? 90 : 120,
          background: `linear-gradient(135deg, ${color}, ${color}CC 60%, ${color}88)`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* Texture overlay sottile per evitare il flat-color */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18), transparent 50%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.15), transparent 50%)",
            pointerEvents: "none",
          }}
        />
        <CompanyLogo
          company={job.company ?? job.title}
          color={color}
          size={compact ? 56 : 76}
          rounded={18}
        />
      </div>

      {/* Bookmark heart — floating sul banner, top-right */}
      {!compact && onToggleSave && (
        <button
          type="button"
          aria-label={isSaved ? "Rimuovi dai preferiti" : "Salva nei preferiti"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 5,
            width: 40,
            height: 40,
            borderRadius: 999,
            background: isSaved ? "#FFFFFF" : "rgba(255,255,255,0.22)",
            border: "1px solid rgba(255,255,255,0.5)",
            color: isSaved ? "#DC2626" : "#FFFFFF",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(12px)",
            transition: "transform 0.15s, background 0.15s",
            fontSize: 18,
            lineHeight: 1,
            boxShadow: isSaved ? "0 2px 8px rgba(0,0,0,0.15)" : undefined,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {isSaved ? "♥" : "♡"}
        </button>
      )}

      {/* Header testuale sotto il banner: title + company + location */}
      <div style={{ padding: "20px 24px 12px" }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
            color: "#0F1012",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {job.title}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 13.5,
            color: "rgba(15,16,18,0.65)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 600, color: "#0F1012" }}>
            {job.company ?? "—"}
          </span>
          {job.location && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Icon name="map-pin" size={11} />
                {shortLocation(job.location)}
              </span>
            </>
          )}
          {postedLabel && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{postedLabel}</span>
            </>
          )}
        </div>
      </div>

      {/* KEY FACTS row — salario + contratto + remote come "stat strip"
          stile Tinder bio. Visivamente forte, leggibile a colpo d'occhio. */}
      {!compact && (salaryLabel || job.contractType || job.remote) && (
        <div
          style={{
            margin: "0 24px 14px",
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(5,150,105,0.06)",
            border: "1px solid rgba(5,150,105,0.15)",
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {salaryLabel && (
            <KeyFact icon="euro" label="RAL" value={salaryLabel} />
          )}
          {job.contractType && (
            <KeyFact
              icon="clock"
              label="Contratto"
              value={job.contractType === "permanent" ? "Tempo indet." : job.contractType}
            />
          )}
          {job.remote && (
            <KeyFact icon="globe" label="Modalità" value="Remote" />
          )}
          {seniority && (
            <KeyFact icon="star" label="Livello" value={seniority} />
          )}
        </div>
      )}

      {/* Description snippet — più lungo (280 char) per densità info */}
      {!compact && descSnippet && (
        <div
          style={{
            padding: "0 24px 14px",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "rgba(15,16,18,0.75)",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {descSnippet}
        </div>
      )}

      {/* Spacer flessibile per spingere pill/footer in basso */}
      <div style={{ flex: 1, minHeight: 4 }} />

      {/* SKILLS: tech tags estratti dalla description */}
      {!compact && skills.length > 0 && (
        <div
          style={{
            padding: "0 24px 14px",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "rgba(15,16,18,0.45)",
              marginRight: 4,
              alignSelf: "center",
            }}
          >
            Tech
          </span>
          {skills.map((s) => (
            <span
              key={s}
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(5,150,105,0.10)",
                color: "#047857",
                border: "1px solid rgba(5,150,105,0.22)",
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Footer hint */}
      {!compact && (
        <div
          style={{
            padding: "14px 24px 20px",
            fontSize: 11.5,
            color: "rgba(15,16,18,0.45)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
          }}
        >
          <Icon name="arrow-up-right" size={11} />
          Tocca la card per la descrizione completa
        </div>
      )}

      {children}
    </div>
  );
}

/**
 * "KeyFact" — riga compatta label/value usata nella stat-strip
 * sotto l'header (RAL, Contratto, Modalità, Livello). Label è
 * uppercase micro, value è bold per leggibilità a colpo d'occhio.
 */
function KeyFact({
  icon,
  label,
  value,
}: {
  icon: "euro" | "clock" | "globe" | "star";
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(15,16,18,0.5)",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Icon name={icon} size={10} />
        {label}
      </div>
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          color: "#0F1012",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** Tronca "Germany (Remote) ; Ireland (Remote) ; …" a "Germany +5" */
function shortLocation(loc: string): string {
  // Split su `;` o `·` o `,` solo se ce ne sono multipli
  const parts = loc
    .split(/[;·]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return loc.length > 32 ? loc.slice(0, 32) + "…" : loc;
  }
  const first = parts[0].replace(/\s*\(.*?\)\s*/, "").trim();
  return `${first} +${parts.length - 1}`;
}

function formatSalary(min: number | null, max: number | null): string {
  const a = min ? Math.round(min / 1000) : null;
  const b = max ? Math.round(max / 1000) : null;
  if (a && b) return `€${a}k–${b}k`;
  if (a) return `€${a}k+`;
  if (b) return `€${b}k`;
  return "";
}

/**
 * Drawer dettagli — slide-in da destra. Mostra description completa,
 * link annuncio originale, pulsanti Apply / Skip in primo piano.
 */
function JobDetailDrawer({
  job,
  onClose,
  onApply,
  onSkip,
  labels,
}: {
  job: JobRow | null;
  onClose: () => void;
  onApply: (j: JobRow) => void;
  onSkip: (j: JobRow) => void;
  labels: {
    apply: string;
    skip: string;
    fullDescription: string;
    openOriginal: string;
  };
}) {
  // Lock body scroll while open
  useEffect(() => {
    if (!job) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [job]);

  const fullDescription = useMemo(
    () => (job ? cleanHtmlText(job.description) : ""),
    [job],
  );

  return (
    <AnimatePresence>
      {job && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(2px)",
              zIndex: 100,
            }}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(560px, 100%)",
              background: "var(--bg)",
              borderLeft: "1px solid var(--border-ds)",
              zIndex: 101,
              display: "flex",
              flexDirection: "column",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 14,
                padding: 24,
                borderBottom: "1px solid var(--border-ds)",
              }}
            >
              <div style={{ display: "flex", gap: 14, flex: 1, minWidth: 0 }}>
                <CompanyLogo
                  company={job.company ?? job.title}
                  color={companyColor(job.company ?? job.title)}
                  size={48}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      letterSpacing: "-0.015em",
                      lineHeight: 1.25,
                    }}
                  >
                    {job.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      color: "var(--fg-muted)",
                      marginTop: 2,
                    }}
                  >
                    {job.company ?? "—"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid var(--border-ds)",
                  background: "var(--bg-elev)",
                  color: "var(--fg-muted)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: "20px 24px 100px",
                overflowY: "auto",
                flex: 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 20,
                }}
              >
                {job.remote && (
                  <span className="ds-chip ds-chip-green">Remote</span>
                )}
                {job.location && (
                  <span
                    className="ds-chip"
                    style={{
                      display: "inline-flex",
                      gap: 5,
                      alignItems: "center",
                    }}
                  >
                    <Icon name="map-pin" size={11} /> {job.location}
                  </span>
                )}
                {job.contractType && (
                  <span
                    className="ds-chip"
                    style={{
                      display: "inline-flex",
                      gap: 5,
                      alignItems: "center",
                    }}
                  >
                    <Icon name="clock" size={11} />
                    {job.contractType === "permanent"
                      ? "Permanent"
                      : job.contractType}
                  </span>
                )}
                {(job.salaryMin || job.salaryMax) && (
                  <span
                    className="ds-chip mono"
                    style={{
                      display: "inline-flex",
                      gap: 5,
                      alignItems: "center",
                      color: "var(--fg)",
                    }}
                  >
                    <Icon name="euro" size={11} />
                    {job.salaryMin
                      ? `€${Math.round(job.salaryMin / 1000)}k`
                      : ""}
                    {job.salaryMin && job.salaryMax ? "–" : ""}
                    {job.salaryMax
                      ? `€${Math.round(job.salaryMax / 1000)}k`
                      : ""}
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--fg-subtle)",
                  fontWeight: 500,
                  marginBottom: 10,
                }}
              >
                {labels.fullDescription}
              </div>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: "var(--fg)",
                  whiteSpace: "pre-wrap",
                  margin: 0,
                }}
              >
                {fullDescription}
              </p>

              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ds-btn"
                style={{
                  marginTop: 24,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                }}
              >
                <Icon name="arrow-up-right" size={12} />
                {labels.openOriginal}
              </a>
            </div>

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "16px 24px",
                background: "var(--bg)",
                borderTop: "1px solid var(--border-ds)",
                display: "flex",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => onSkip(job)}
                className="ds-btn"
                style={{ flex: 1, padding: "11px 14px", fontSize: 13.5 }}
              >
                ✕ {labels.skip}
              </button>
              <button
                type="button"
                onClick={() => onApply(job)}
                className="ds-btn ds-btn-primary"
                style={{ flex: 2, padding: "11px 14px", fontSize: 13.5 }}
              >
                <Icon name="zap" size={13} /> {labels.apply}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
