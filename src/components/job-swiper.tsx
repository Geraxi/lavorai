"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { PaywallDialog } from "@/components/paywall-dialog";
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
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [animDir, setAnimDir] = useState<"left" | "right" | null>(null);

  // Carica skipped da localStorage solo lato client per evitare hydration mismatch
  useEffect(() => {
    setSkipped(loadSkipped());
  }, []);

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

  // Keyboard navigation
  useEffect(() => {
    if (!currentJob) return;
    const onKey = (e: KeyboardEvent) => {
      if (animatingId) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        apply(currentJob);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skip(currentJob.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentJob, animatingId, apply, skip]);

  if (!currentJob) {
    return (
      <div
        style={{
          padding: "80px 24px",
          textAlign: "center",
          border: "1px dashed var(--border-ds)",
          borderRadius: 12,
          background: "var(--bg-elev)",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          {t("emptyTitle")}
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: "var(--fg-muted)",
            maxWidth: 360,
            margin: "0 auto",
            lineHeight: 1.5,
          }}
        >
          {t("emptyBody")}
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(SKIP_KEY);
            setSkipped(new Set());
          }}
          className="ds-btn"
          style={{ marginTop: 18 }}
        >
          {t("resetSkipped")}
        </button>
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
          onSwipe={(dir) => {
            if (dir === "right") apply(currentJob);
            else skip(currentJob.id);
          }}
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
    </>
  );
}

/**
 * Card di sfondo (peek) — non interagibile, leggermente scalata e
 * spostata sotto per dare percezione di profondità.
 */
function PeekCard({ job, depth }: { job: JobRow; depth: number }) {
  const scale = 1 - depth * 0.04;
  const yOffset = depth * 8;
  const opacity = 1 - depth * 0.35;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${scale}) translateY(${yOffset}px)`,
        opacity,
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
  onSwipe,
}: {
  job: JobRow;
  isAnimatingOut: boolean;
  animDir: "left" | "right" | null;
  onSwipe: (dir: "left" | "right") => void;
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
      animate={exitAnimation}
      transition={{ duration: 0.25, ease: "easeOut" }}
      whileTap={{ cursor: "grabbing" }}
    >
      <JobCardSurface job={job}>
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
 * UI condivisa della card (sia attiva che peek). Contiene company logo,
 * titolo, location/contract/salary chips, descrizione.
 */
function JobCardSurface({
  job,
  compact,
  children,
}: {
  job: JobRow;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const color = companyColor(job.company ?? job.title);
  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        padding: 28,
        borderRadius: 18,
        border: "1px solid var(--border-ds)",
        background: "var(--bg-elev)",
        boxShadow:
          "0 12px 30px -8px rgba(0,0,0,0.18), 0 4px 10px -4px rgba(0,0,0,0.1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: compact ? "none" : "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <CompanyLogo
          company={job.company ?? job.title}
          color={color}
          size={56}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
            }}
          >
            {job.title}
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--fg-muted)",
              marginTop: 3,
            }}
          >
            {job.company ?? "—"}
          </div>
        </div>
        {job.remote && (
          <span className="ds-chip ds-chip-green" style={{ flexShrink: 0 }}>
            Remote
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 16,
        }}
      >
        {job.location && (
          <span
            className="ds-chip"
            style={{ display: "inline-flex", gap: 5, alignItems: "center" }}
          >
            <Icon name="map-pin" size={11} /> {job.location}
          </span>
        )}
        {job.contractType && (
          <span
            className="ds-chip"
            style={{ display: "inline-flex", gap: 5, alignItems: "center" }}
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
            {job.salaryMin ? `€${Math.round(job.salaryMin / 1000)}k` : ""}
            {job.salaryMin && job.salaryMax ? "–" : ""}
            {job.salaryMax ? `€${Math.round(job.salaryMax / 1000)}k` : ""}
          </span>
        )}
      </div>

      <div
        style={{
          marginTop: 18,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "var(--fg-muted)",
          flex: 1,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: compact ? 4 : 10,
          WebkitBoxOrient: "vertical",
        }}
      >
        {job.description}
      </div>

      {children}
    </div>
  );
}
