"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Briefcase, Check, ChevronRight, EyeOff } from "lucide-react";
import { GhostBadge } from "@/components/ghost-badge";
import type { GhostJobResult } from "@/lib/ghost-job";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { PaywallDialog } from "@/components/paywall-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";

export interface JobRow {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string;
  url: string;
  contractType: string | null;
  remote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  /** Solo letto dal JobSwiper per la pill "Today / 3d ago / 2w ago". */
  postedAt?: Date | null;
  /** Annuncio per categorie protette (L. 68/99). */
  protectedCategory?: boolean;
  /** Rischio "annuncio fantasma" (src/lib/ghost-job.ts). */
  ghost?: GhostJobResult;
}

function formatSalaryRange(min: number | null, max: number | null): string {
  const k = (v: number) => `€${Math.round((v >= 10 && v < 500 ? v * 1000 : v) / 1000)}k`;
  if (min && max) return `${k(min)}–${k(max).slice(1)}`;
  if (min) return `${k(min)}+`;
  if (max) return `fino a ${k(max)}`;
  return "";
}

function portalOf(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("linkedin")) return "linkedin";
  if (u.includes("indeed")) return "indeed";
  if (u.includes("greenhouse")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("workable.com")) return "workable";
  if (u.includes("infojobs")) return "infojobs";
  return "other";
}

export function JobsList({ jobs, label, alreadyApplied = [] }: { jobs: JobRow[]; label?: string; alreadyApplied?: string[] }) {
  const t = useTranslations("jobsList");
  const router = useRouter();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);

  const [hideGhost, setHideGhost] = useState(false);
  const ghostHigh = useMemo(() => jobs.filter((j) => j.ghost?.level === "alto").length, [jobs]);
  const visibleJobs = useMemo(() => (hideGhost ? jobs.filter((j) => j.ghost?.level !== "alto") : jobs), [jobs, hideGhost]);
  const priorIds = useMemo(() => new Set(alreadyApplied), [alreadyApplied]);
  const remainingJobs = useMemo(
    () => jobs.filter((j) => !appliedIds.has(j.id) && !priorIds.has(j.id)),
    [jobs, appliedIds, priorIds],
  );

  async function applyOne(job: JobRow) {
    setApplyingId(job.id);
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
      if (res.status === 409 && (body?.error === "privacy_consent_required" || body?.error === "activation_incomplete")) {
        toast.error(body?.message ?? t("retryError"));
        router.push(typeof body?.redirect === "string" && body.redirect.startsWith("/") ? body.redirect : "/onboarding");
        return;
      }
      if (res.status === 402) {
        setPaywallMessage(body?.message ?? null);
        setPaywallOpen(true);
        return;
      }
      if (res.status === 409 && body?.error === "below_match_threshold") {
        toast.error(body?.message ?? t("belowMatch"));
        return;
      }
      if (!res.ok) {
        toast.error(body?.message ?? t("retryError"));
        return;
      }
      setAppliedIds((s) => new Set(s).add(job.id));
      toast.success(t("applicationSent", { title: job.title }));
    } catch {
      toast.error(t("networkError"));
    } finally {
      setApplyingId(null);
    }
  }

  function askApplyAll() {
    if (remainingJobs.length === 0) return;
    setBatchConfirmOpen(true);
  }

  async function applyAll() {
    setBatchConfirmOpen(false);
    if (remainingJobs.length === 0) return;
    setBatchLoading(true);

    // Chunk a 100 per request: il server accetta fino a 500 ma a 100
    // mantieni la singola request <2s e dai feedback progressivo.
    const CHUNK_SIZE = 100;
    const allIds = remainingJobs.map((j) => j.id);
    const chunks: string[][] = [];
    for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
      chunks.push(allIds.slice(i, i + CHUNK_SIZE));
    }

    let totalEnqueued = 0;
    let totalAwaitingConsent = 0;
    let totalBelowThreshold = 0;
    let lastMatchMin = 0;
    let lastRemaining: number | null = null;
    const enqueuedJobIds: string[] = [];

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const res = await fetch("/api/applications/apply-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds: chunk }),
        });
        const body = await res.json().catch(() => ({}));

        if (res.status === 409 && body?.error === "missing_cv") {
          toast.error(t("uploadCvFirst"));
          router.push("/onboarding");
          return;
        }
        if (res.status === 409 && (body?.error === "privacy_consent_required" || body?.error === "activation_incomplete")) {
          toast.error(body?.message ?? t("uploadCvFirst"));
          router.push(typeof body?.redirect === "string" && body.redirect.startsWith("/") ? body.redirect : "/onboarding");
          return;
        }
        if (res.status === 402) {
          // Quota mensile esaurita: smetti di chunkare ma mostra
          // quello già inviato, poi paywall.
          setPaywallMessage(body?.message ?? null);
          setPaywallOpen(true);
          break;
        }
        if (res.status === 429) {
          toast.error(
            body?.message ?? "Troppe richieste. Aspetta qualche minuto.",
          );
          break;
        }
        if (!res.ok) {
          toast.error(body?.message ?? `Errore al batch ${i + 1}/${chunks.length}.`);
          break;
        }

        totalEnqueued += body.enqueued ?? 0;
        totalAwaitingConsent += body.awaitingConsent ?? 0;
        totalBelowThreshold += body.belowThreshold ?? 0;
        lastMatchMin = body.matchMin ?? lastMatchMin;
        lastRemaining = body.remaining ?? lastRemaining;
        // ID effettivamente accettati: i primi `body.enqueued` del chunk
        for (let k = 0; k < (body.enqueued ?? 0); k++)
          enqueuedJobIds.push(chunk[k]);

        if (chunks.length > 1) {
          toast.message(
            t("batchProgress", { current: i + 1, total: chunks.length, sent: totalEnqueued }),
          );
        }
      }

      if (enqueuedJobIds.length > 0) {
        setAppliedIds((s) => {
          const next = new Set(s);
          for (const id of enqueuedJobIds) next.add(id);
          return next;
        });
      }

      const bits: string[] = [];
      if (totalEnqueued > 0) bits.push(t("toastSent", { count: totalEnqueued }));
      if (totalAwaitingConsent > 0)
        bits.push(t("toastAwaitingConsent", { count: totalAwaitingConsent }));
      if (totalBelowThreshold > 0)
        bits.push(
          t("toastSkippedMatch", { count: totalBelowThreshold, pct: lastMatchMin }),
        );
      if (lastRemaining != null)
        bits.push(t("toastRemaining", { count: lastRemaining }));
      if (bits.length > 0) toast.success(bits.join(" · "));
      else if (totalEnqueued + totalAwaitingConsent === 0)
        toast.error(t("noneSent"));

      if (totalEnqueued > 0) {
        setTimeout(() => router.push("/applications"), 1200);
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setBatchLoading(false);
    }
  }

  return (
    <>
      <section className="pm-card jobs-card" aria-label={label ?? t("listLabel")}>
        <header className="pm-card-head">
          <h2><Briefcase size={15} strokeWidth={1.75} aria-hidden /> {label ?? t("listLabel")} <span className="pm-count">{visibleJobs.length}</span></h2>
          {ghostHigh > 0 && (
            <label className="jobs-ghost-filter" title="Nasconde gli annunci con rischio alto di essere fantasma">
              <input type="checkbox" checked={hideGhost} onChange={(e) => setHideGhost(e.target.checked)} />
              <EyeOff size={13} strokeWidth={1.75} aria-hidden /> Nascondi sospetti ({ghostHigh})
            </label>
          )}
          <button
            type="button"
            onClick={askApplyAll}
            disabled={batchLoading || remainingJobs.length === 0}
            className="pm-btn-ghost"
          >
            {batchLoading ? t("sending") : t("applyToAll", { count: remainingJobs.length })}
          </button>
        </header>
        {appliedIds.size > 0 && <p className="pm-muted jobs-queued-note">{t("queuedNote", { count: appliedIds.size })}</p>}
        <ul className="pm-list jobs-list">
          {visibleJobs.map((j) => {
            const isApplied = appliedIds.has(j.id);
            const isPrior = priorIds.has(j.id);
            const isApplying = applyingId === j.id;
            const salary = formatSalaryRange(j.salaryMin, j.salaryMax);
            return (
              <li key={j.id} className="jobs-row">
                <Link href={`/jobs/${j.id}`} className="jobs-row-main">
                  <CompanyLogo company={j.company ?? j.title} color={companyColor(j.company ?? j.title)} size={32} url={j.url} />
                  <span className="jobs-row-text">
                    <strong>{j.title}</strong>
                    <small>{[j.company, j.location].filter(Boolean).join(" · ") || "—"}</small>
                  </span>
                </Link>
                <span className="jobs-row-meta">
                  {j.ghost && <GhostBadge result={j.ghost} />}
                  {j.remote && <span className="pm-pill tone-neutral">{t("remote")}</span>}
                  {j.protectedCategory && <span className="pm-pill tone-neutral" title="Riservato/prioritario categorie protette, L. 68/99">L. 68/99</span>}
                  {j.contractType && <span className="jobs-row-fact">{j.contractType === "permanent" ? t("permanent") : j.contractType}</span>}
                  <span className={`jobs-row-fact${salary ? " is-strong" : ""}`}>{salary || t("noSalary")}</span>
                </span>
                <span className="jobs-row-actions">
                  {isPrior ? <Link href="/applications" className="pm-btn-ghost is-muted">{t("alreadyApplied")}</Link> : <button
                    type="button"
                    onClick={() => applyOne(j)}
                    disabled={isApplying || isApplied || batchLoading}
                    className={isApplied ? "pm-btn-ghost is-done" : "pm-btn-ghost"}
                  >
                    {isApplied ? <><Check size={13} aria-hidden /> {t("queued")}</> : isApplying ? t("sendingShort") : t("apply")}
                  </button>}
                  <Link href={`/jobs/${j.id}`} className="jobs-row-go" aria-label={t("details")}><ChevronRight size={16} aria-hidden /></Link>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <PaywallDialog
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        variant="limit"
        sub={paywallMessage ?? undefined}
      />
      <ConfirmDialog
        open={batchConfirmOpen}
        title={t("confirmTitle", { count: remainingJobs.length })}
        message={t("confirmMessage")}
        confirmLabel={t("confirmAll")}
        cancelLabel={t("cancel")}
        variant="accent"
        onConfirm={applyAll}
        onCancel={() => setBatchConfirmOpen(false)}
      />
    </>
  );
}
