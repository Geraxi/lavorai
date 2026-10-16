"use client";

import { MatchExplanation } from "@/components/match-explanation";
import type { MatchExplanation as Explanation } from "@/lib/match-explanation";
import { jobSourceLabel } from "@/lib/job-source-label";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Heart, Sparkles, Target } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { PaywallDialog } from "@/components/paywall-dialog";
import { cleanHtmlText } from "@/lib/scrapers/html-clean";
import type { JobRow } from "@/components/jobs-list";

/**
 * Tinder-style swipe card stack per i job recommendation.
 *  - Drag right + drop oltre soglia → applica
 *  - Drag left + drop oltre soglia → dismiss this listing (owner-scoped)
 *  - Click su "Skip" / "Apply" → stessa azione, animazione triggerata
 *  - Arrow keyboard ← → → equivalente click
 *
 * Stack visivo: 1 card in primo piano + 2 dietro (z-index decrescente)
 * per dare profondità e suggerire che ci sono altre opportunità.
 *
 * Dismissals persist through /api/jobs/dismissals and are reversible in Discover.
 * Apply usa lo stesso endpoint di /jobs (`/api/applications/apply`).
 */

const SWIPE_THRESHOLD = 100; // px di drag minimo per triggare l'action
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

type DiscoverJob = JobRow & { matchScore?: number | null; explanation?: Explanation };

export function DiscoverHeading({ count }: { count: number }) {
  const t = useTranslations("discoverPage");
  return <header className="workspace-heading"><div><div className="workspace-eyebrow">Discover / LavorAI</div><h1>{t("heading")}</h1><p>{t("subtitle", { count })}</p></div></header>;
}

export function JobSwiper({ jobs }: { jobs: DiscoverJob[] }) {
  const en = useLocale() === "en";
  const tr = (it: string, english: string) => en ? english : it;
  const [remoteOnly, setRemoteOnly] = useState(false);
  const t = useTranslations("discoverPage");
  const router = useRouter();
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [animDir, setAnimDir] = useState<"left" | "right" | null>(null);
  const [detailJob, setDetailJob] = useState<JobRow | null>(null);

  // Local saved jobs remain a separate existing feature.
  useEffect(() => {
    // Explicit dismissals now come from the owner-scoped server selection.
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
    () => jobs.filter((j) => !skipped.has(j.id) && (!remoteOnly || j.remote)),
    [jobs, skipped, remoteOnly],
  );

  const currentJob = queue[0];
  // Peek cards (queue.slice(1,3)) rimosse — vedi commento nel JSX sotto.

  // Skip programmaticamente (anche da bottone o swipe)
  const skip = useCallback(async (jobId: string) => {
    if (animatingId) return;
    setAnimatingId(jobId); setAnimDir(null);
    try {
      const result = await fetch("/api/jobs/dismissals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, action: "dismiss" }) });
      if (!result.ok) throw new Error();
      setSkipped(old => new Set([...old, jobId]));
      toast.success(en ? "Listing dismissed. Restore it from Dismissed listings." : "Annuncio escluso. Puoi ripristinarlo da Annunci esclusi.");
    } catch { toast.error(en ? "Couldn't dismiss this listing. Try again." : "Impossibile escludere l'annuncio. Riprova."); }
    finally { setAnimatingId(null); setAnimDir(null); }
  }, [animatingId, en]);

  // Apply — UX ottimistica: la card scorre a destra e la SUCCESSIVA
  // appare in 250ms, indipendentemente da quanto ci mette il fetch.
  // Il fetch parte in parallelo; se fallisce, toast di errore ma
  // l'utente ha già visto il prossimo job (perceived latency 250ms
  // invece di 1-2s che era prima).
  const apply = useCallback(
    (job: JobRow) => {
      setAnimatingId(job.id);
      setAnimDir("right");
      // Rimuovi la card dopo l'animazione, non aspettare il fetch.
      setTimeout(() => {
        setSkipped((prev) => {
          const next = new Set(prev);
          next.add(job.id);
          // Applied cards are hidden for this visit only; no preference is inferred.
          return next;
        });
        setAnimatingId(null);
        setAnimDir(null);
      }, 250);
      // Fetch in background — mostriamo il toast solo se il risultato
      // richiede l'attenzione dell'utente (errore, paywall, missing CV).
      fetch("/api/applications/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, portal: portalOf(job.url) }),
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (res.status === 409 && body?.error === "missing_cv") {
            toast.error(t("uploadCvFirst"));
            router.push("/onboarding");
            return;
          }
          if (res.status === 402) {
            setPaywallMessage(body?.message ?? null);
            setPaywallOpen(true);
            return;
          }
          if (!res.ok) {
            toast.error(
              `"${job.title}": ${body?.message ?? t("retryError")}`,
            );
            return;
          }
          toast.success(t("applied", { title: job.title }));
        })
        .catch(() => {
          toast.error(`"${job.title}": ${t("networkError")}`);
        });
    },
    [t, router],
  );

  // Keyboard navigation (disabilitato quando il drawer dettagli è aperto)
  useEffect(() => {
    if (!currentJob) return;
    const onKey = (e: KeyboardEvent) => {
      if (animatingId || detailJob || paywallOpen || e.defaultPrevented || (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, button, a, [contenteditable=true], [role=dialog]"))) return;
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
  }, [currentJob, animatingId, detailJob, paywallOpen, apply, skip]);

  if (!currentJob) {
    const filteredOut = remoteOnly && jobs.some(job => !skipped.has(job.id));
    return <section className="workspace-panel" style={{ padding: 32, textAlign: "center" }}>
      <Target size={38} aria-hidden style={{ margin: "0 auto 16px", color: "var(--primary-ds)" }} />
      <a className="fit-link" href="/discover?dismissed=1">{tr("Annunci esclusi · ripristina", "Dismissed listings · restore")}</a><h2 style={{ fontSize: 22 }}>{filteredOut ? tr("Nessun ruolo remoto in questa selezione", "No remote roles in this selection") : jobs.length === 0 ? tr("Nessuna offerta trovata", "No jobs found") : tr("Hai visto tutte le offerte", "You have reviewed this selection")}</h2>
      <p className="workspace-muted">{filteredOut ? tr("Ci sono altri ruoli disponibili. Rimuovi il filtro per vederli.", "Other roles are available. Clear the filter to see them.") : tr("Rivedi le preferenze di ricerca o esplora gli annunci disponibili.", "Review your search preferences or explore available listings.")}</p>
      <div className="workspace-toolbar" style={{ justifyContent: "center", marginTop: 18 }}>
        {remoteOnly && <button className="ds-btn" onClick={() => setRemoteOnly(false)}>{tr("Mostra tutti i ruoli", "Show all roles")}</button>}
        <a className="ds-btn ds-btn-primary" href="/preferences">{tr("Modifica preferenze", "Edit preferences")}</a>
        <a className="ds-btn" href="/jobs">{tr("Esplora annunci", "Browse jobs")}</a>
      </div>
    </section>;
  }

  return (
    <>
      <div className="workspace-toolbar">
        <button type="button" className={`ds-btn${!remoteOnly ? " ds-btn-primary" : ""}`} aria-pressed={!remoteOnly} onClick={() => setRemoteOnly(false)}>{tr("Tutti i ruoli", "All roles")} ({jobs.length})</button>
        <button type="button" className={`ds-btn${remoteOnly ? " ds-btn-primary" : ""}`} aria-pressed={remoteOnly} onClick={() => setRemoteOnly(true)}>{tr("Solo remoto", "Remote only")} ({jobs.filter(j => j.remote).length})</button>
        <a className="ds-btn" href="/preferences"><Icon name="filter" size={13} /> {tr("Preferenze di ricerca", "Search preferences")}</a>
        <div className="discover-selection"><span>{t("queueRemaining", { count: queue.length })}</span><span>{jobs.filter(j => saved.has(j.id)).length} {tr("salvati su questo dispositivo", "saved on this device")}</span></div>
      </div>
      <div className="discover-layout">
        <div className="discover-main">
          <div className="discover-deck">
            <SwipeCard key={currentJob.id} job={currentJob} isAnimatingOut={animatingId === currentJob.id} animDir={animDir}
              isSaved={saved.has(currentJob.id)} onToggleSave={() => toggleSave(currentJob.id, currentJob.title)}
              onSwipe={(dir) => { if (dir === "right") apply(currentJob); else skip(currentJob.id); }}
              onTap={() => setDetailJob(currentJob)} />
          </div>
          <div className="workspace-toolbar discover-actions">
            <button type="button" className="ds-btn" onClick={() => skip(currentJob.id)} disabled={!!animatingId} aria-label={tr("Non pertinente", "Not relevant")}><Icon name="x" size={16} /> {tr("Non pertinente", "Not relevant")}</button>
            <button type="button" className="ds-btn" onClick={() => setDetailJob(currentJob)}>{tr("Dettagli", "Details")}</button>
            <button type="button" className="ds-btn ds-btn-primary" onClick={() => apply(currentJob)} disabled={!!animatingId} aria-label={t("apply")}><Icon name="send" size={16} /> {t("apply")}</button>
          </div>
          <p className="workspace-muted" style={{ textAlign: "center" }}>{tr("← esclude questo annuncio · → candidati · esclusioni ripristinabili", "← dismisses this listing · → apply · dismissals can be restored")}</p>
        </div>
        <aside className="workspace-stack">
          {currentJob.explanation && <MatchExplanation explanation={currentJob.explanation} en={en} />}
          <a className="fit-link" href="/discover?dismissed=1">{tr("Annunci esclusi · ripristina", "Dismissed listings · restore")}</a>
          <section className="workspace-panel">
            <h2>{tr("Coda di riserva", "Up next")} <span className="workspace-chip">{Math.min(queue.length - 1, 3)}</span></h2>
            {queue.slice(1, 4).map(job => <button key={job.id} type="button" className="discover-queue" onClick={() => setDetailJob(job)}>
              <div className="discover-queue-heading"><strong>{job.title}</strong>{job.matchScore != null && <span className="workspace-chip" title={tr("Match stimato dal CV", "Estimated CV match")}>{job.matchScore}%</span>}</div><small>{job.company ?? "—"} · {job.location ?? tr("Sede non indicata", "Location not specified")}</small>
              {(job.salaryMin || job.salaryMax) ? <small>{formatSalary(job.salaryMin, job.salaryMax)}</small> : null}
            </button>)}
            {queue.length === 1 && <p className="workspace-muted">{tr("È l'ultimo annuncio della selezione.", "This is the last job in this selection.")}</p>}
          </section>
          <section className="workspace-panel">
            <h2>{tr("Affina la ricerca", "Refine your search")}</h2><p className="workspace-muted">{tr("Non pertinente esclude solo questo annuncio dai suggerimenti. Non modifica ruoli, aziende o dati personali. Per escludere altri ruoli, modifica le preferenze.", "Not relevant excludes only this listing from suggestions. It does not change roles, companies or personal data. Edit preferences to exclude other roles.")}</p>
            <p className="workspace-muted">{tr("Il match è una stima dal CV, non una valutazione del recruiter. Rivedi località e retribuzione nelle preferenze.", "Match is a CV-based estimate, not a recruiter assessment. Review location and salary in your preferences.")}</p>
            <a className="ds-btn" href="/preferences" style={{ marginTop: 12 }}>{tr("Modifica preferenze", "Edit preferences")}</a>
          </section>
          <section className="workspace-panel">
            <h2>{tr("Prima di candidarti", "Before you apply")}</h2>
            <p className="workspace-muted">{tr("Leggi l'annuncio completo e controlla i requisiti. La candidatura segue i controlli e i limiti del tuo account; nessun invio è garantito.", "Read the full description and check the requirements. Applications follow your account controls and limits; submission is not guaranteed.")}</p>
          </section>
        </aside>
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
          skip: tr("Non pertinente", "Not relevant"),
          fullDescription: t("fullDescription"),
          openOriginal: t("openOriginal"),
        }}
      />
    </>
  );
}

// Componente PeekCard rimosso. Dava percezione di stack ma causava
// bleed-through del contenuto della prossima card attraverso la card
// attiva durante/dopo lo swipe. Rifare con un'AnimatePresence proper
// (next-card già montata, scale-up + opacity-in sincronizzati con
// l'exit della corrente) prima di re-introdurre il peek visuale.

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
  job: DiscoverJob;
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
          APPLY <Sparkles size={16} aria-hidden style={{ display: "inline-block", verticalAlign: "-0.15em", marginLeft: 4 }} />
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
  job: DiscoverJob;
  compact?: boolean;
  isSaved?: boolean;
  onToggleSave?: () => void;
  children?: React.ReactNode;
}) {
  const en = useLocale() === "en";
  const tr = (it: string, english: string) => en ? english : it;
  const skills = useMemo(() => extractSkills(job.description), [job.description]);
  const description = useMemo(() => cleanHtmlText(job.description).replace(/\s+/g, " ").trim(), [job.description]);
  const salary = formatSalary(job.salaryMin, job.salaryMax);
  return <article className="discover-card">
    <div className="discover-card-heading">
      <CompanyLogo company={job.company ?? job.title} color={companyColor(job.company ?? job.title)} size={42} rounded={10} />
      <div><strong>{job.company ?? tr("Azienda non indicata", "Company not specified")}</strong><p className="workspace-muted">{job.location ?? tr("Sede non indicata", "Location not specified")}</p></div>
    </div>
    {onToggleSave && <button type="button" className="discover-save" aria-pressed={isSaved} aria-label={isSaved ? tr("Rimuovi dai preferiti", "Remove from saved") : tr("Salva nei preferiti", "Save job")}
      onClick={e => { e.stopPropagation(); onToggleSave(); }} onPointerDown={e => e.stopPropagation()}><Heart size={18} fill={isSaved ? "currentColor" : "none"} /></button>}
    <div>
      {job.matchScore != null && <span className="workspace-chip" style={{ marginBottom: 10 }}>{job.matchScore}% {tr("match stimato dal CV", "estimated CV match")}</span>}
      <h2>{job.title}</h2>
      <p style={{ marginTop: 8, color: salary ? "var(--primary-ds)" : "var(--fg-muted)" }}>{salary || tr("Retribuzione non indicata", "Salary not specified")}</p>
    </div>
    <div className="discover-tags">
      {job.remote && <span>{tr("Remoto", "Remote")}</span>}
      {job.contractType && <span>{job.contractType === "permanent" ? tr("Tempo indeterminato", "Permanent") : job.contractType}</span>}
      {jobSourceLabel(job.url) && <span>{jobSourceLabel(job.url)}</span>}
    </div>
    {skills.length > 0 && <div><div className="workspace-eyebrow">{tr("Competenze citate nell'annuncio", "Skills mentioned in the job")}</div><div className="discover-tags">{skills.map(skill => <span key={skill}>{skill}</span>)}</div></div>}
    {description && <div className="discover-description">{description.length > 420 ? description.slice(0, 420) + "…" : description}</div>}
    <div className="discover-facts"><div><small>{tr("Sede", "Location")}</small><strong>{job.location || tr("Non indicata", "Not specified")}</strong></div><div><small>{tr("Contratto", "Contract")}</small><strong>{job.contractType === "permanent" ? tr("Indeterminato", "Permanent") : job.contractType || tr("Non indicato", "Not specified")}</strong></div><div><small>{tr("Pubblicato", "Posted")}</small><strong>{job.postedAt ? new Date(job.postedAt).toLocaleDateString(en ? "en-GB" : "it-IT", { day: "numeric", month: "short" }) : "—"}</strong></div></div>
    <p className="workspace-muted discover-footnote">{tr("Apri i dettagli per leggere la descrizione completa.", "Open details to read the full description.")}</p>
    {children}
  </article>;
}

/**
 * Pill rotonda riusabile per la card swipe. Toni:
 *   default → grigio neutro (location, posted, contract)
 *   green   → verde solido (remote)
 *   salary  → verde forte enfatizzato (RAL)
 *   accent  → outline scuro (seniority)
 *   trust   → verde tenue (portale ATS = invio diretto)
 *   tech    → verde tenue (skill estratte)
 */
function Pill({
  icon,
  text,
  tone = "default",
}: {
  icon?: "euro" | "clock" | "globe" | "star" | "map-pin" | "zap";
  text: string;
  tone?: "default" | "green" | "salary" | "accent" | "trust" | "tech";
}) {
  const palette: Record<
    string,
    { bg: string; fg: string; border: string; weight: number }
  > = {
    default: {
      bg: "rgba(15,16,18,0.04)",
      fg: "rgba(15,16,18,0.70)",
      border: "rgba(15,16,18,0.10)",
      weight: 500,
    },
    green: {
      bg: "#059669",
      fg: "#FFFFFF",
      border: "#059669",
      weight: 600,
    },
    salary: {
      bg: "rgba(5,150,105,0.12)",
      fg: "#047857",
      border: "rgba(5,150,105,0.35)",
      weight: 700,
    },
    accent: {
      bg: "transparent",
      fg: "#0F1012",
      border: "rgba(15,16,18,0.28)",
      weight: 600,
    },
    trust: {
      bg: "rgba(5,150,105,0.08)",
      fg: "#047857",
      border: "rgba(5,150,105,0.22)",
      weight: 600,
    },
    tech: {
      bg: "rgba(5,150,105,0.10)",
      fg: "#047857",
      border: "rgba(5,150,105,0.22)",
      weight: 600,
    },
  };
  const p = palette[tone] ?? palette.default;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: p.weight,
        lineHeight: 1.2,
        background: p.bg,
        color: p.fg,
        border: `1px solid ${p.border}`,
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {icon && <Icon name={icon} size={11} />}
      {text}
    </span>
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
                {labels.openOriginal}{jobSourceLabel(job.url) ? ` · ${jobSourceLabel(job.url)}` : ""}
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
