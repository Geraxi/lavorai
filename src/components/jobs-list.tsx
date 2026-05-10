"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import {
  SectionBody,
  SectionCard,
} from "@/components/design/section-card";
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

export function JobsList({ jobs }: { jobs: JobRow[] }) {
  const t = useTranslations("jobsList");
  const router = useRouter();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);

  const remainingJobs = useMemo(
    () => jobs.filter((j) => !appliedIds.has(j.id)),
    [jobs, appliedIds],
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
      {/* Batch action bar */}
      <div
        className="mb-4 flex items-center justify-between rounded-lg border p-3"
        style={{
          background: "var(--bg-elev)",
          borderColor: "var(--border-ds)",
        }}
      >
        <div style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>{remainingJobs.length}</span>{" "}
          <span style={{ color: "var(--fg-muted)" }}>
            posizioni compatibili
            {appliedIds.size > 0
              ? ` · ${appliedIds.size} già in coda`
              : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={askApplyAll}
          disabled={batchLoading || remainingJobs.length === 0}
          className="ds-btn ds-btn-accent"
          style={{ padding: "8px 14px", fontSize: 13 }}
        >
          {batchLoading ? (
            <>
              <Icon name="refresh" size={13} /> {t("sending")}
            </>
          ) : (
            <>
              <Icon name="sparkles" size={13} /> {t("applyToAll", { count: remainingJobs.length })}
            </>
          )}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 12,
        }}
      >
        {jobs.map((j) => {
          const color = companyColor(j.company ?? j.title);
          const isApplied = appliedIds.has(j.id);
          const isApplying = applyingId === j.id;
          return (
            <SectionCard
              key={j.id}
              className="h-full transition-colors hover:border-[var(--fg)]"
            >
              <SectionBody>
                <Link
                  href={`/jobs/${j.id}`}
                  className="block"
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <div className="flex items-start gap-2.5">
                    <CompanyLogo
                      company={j.company ?? j.title}
                      color={color}
                      size={34}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {j.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "var(--fg-muted)",
                          marginTop: 1,
                        }}
                      >
                        {j.company ?? "—"}
                      </div>
                    </div>
                    {j.remote && (
                      <span className="ds-chip ds-chip-green">{t("remote")}</span>
                    )}
                  </div>
                  <div
                    className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1"
                    style={{ fontSize: 11.5, color: "var(--fg-muted)" }}
                  >
                    {j.location && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="map-pin" size={11} /> {j.location}
                      </span>
                    )}
                    {j.contractType && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="clock" size={11} />{" "}
                        {j.contractType === "permanent"
                          ? t("permanent")
                          : j.contractType}
                      </span>
                    )}
                    {(j.salaryMin || j.salaryMax) && (
                      <span
                        className="mono inline-flex items-center gap-1"
                        style={{ color: "var(--fg)" }}
                      >
                        <Icon name="euro" size={11} />
                        {j.salaryMin
                          ? `€${Math.round(j.salaryMin / 1000)}k`
                          : ""}
                        {j.salaryMin && j.salaryMax ? "–" : ""}
                        {j.salaryMax
                          ? `€${Math.round(j.salaryMax / 1000)}k`
                          : ""}
                      </span>
                    )}
                  </div>
                  <p
                    className="mt-2 line-clamp-2"
                    style={{
                      fontSize: 12.5,
                      color: "var(--fg-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    {j.description}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => applyOne(j)}
                  disabled={isApplying || isApplied || batchLoading}
                  className="ds-btn ds-btn-primary mt-3 w-full"
                  style={{ padding: "7px 10px", fontSize: 12.5 }}
                >
                  {isApplied ? (
                    <>
                      <Icon name="check" size={12} /> {t("queued")}
                    </>
                  ) : isApplying ? (
                    <>
                      <Icon name="refresh" size={12} /> {t("sendingShort")}
                    </>
                  ) : (
                    <>
                      <Icon name="sparkles" size={12} /> {t("apply")}
                    </>
                  )}
                </button>
              </SectionBody>
            </SectionCard>
          );
        })}
      </div>
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
