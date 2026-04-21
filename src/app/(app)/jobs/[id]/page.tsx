import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import { ApplyButton } from "@/components/apply-button";
import { getJobById } from "@/lib/jobs-repo";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await getJobById(id);
  if (!job) return { title: "Job non trovato" };
  return {
    title: `${job.title}${job.company ? ` · ${job.company}` : ""}`,
  };
}

export default async function JobDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const job = await getJobById(id);
  if (!job) notFound();

  const color = companyColor(job.company ?? job.title);
  const portal = job.url.toLowerCase().includes("linkedin")
    ? "linkedin"
    : job.url.toLowerCase().includes("indeed")
      ? "indeed"
      : "infojobs";

  return (
    <>
      <AppTopbar
        title={job.title}
        breadcrumb={`Job board · ${job.company ?? "—"}`}
      />
      <div style={{ padding: "24px 32px 80px", maxWidth: 1200, width: "100%", margin: "0 auto" }}>
        <Link
          href="/jobs"
          className="mb-4 inline-flex items-center gap-1"
          style={{ fontSize: 12.5, color: "var(--fg-muted)" }}
        >
          <Icon name="chevron-right" size={12} style={{ transform: "rotate(180deg)" }} />
          Torna al job board
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
          <SectionCard>
            <SectionBody>
              <div className="flex items-start gap-3">
                <CompanyLogo company={job.company ?? job.title} color={color} size={44} />
                <div className="min-w-0 flex-1">
                  <h1
                    style={{
                      fontSize: 24,
                      fontWeight: 600,
                      letterSpacing: "-0.022em",
                      margin: 0,
                    }}
                  >
                    {job.title}
                  </h1>
                  {job.company && (
                    <p
                      style={{
                        fontSize: 14,
                        color: "var(--fg-muted)",
                        marginTop: 4,
                      }}
                    >
                      {job.company}
                    </p>
                  )}
                </div>
                {job.remote && (
                  <span className="ds-chip ds-chip-green">Remoto</span>
                )}
              </div>
              <div
                className="mt-4 flex flex-wrap items-center gap-4"
                style={{ fontSize: 12.5, color: "var(--fg-muted)" }}
              >
                {job.location && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="map-pin" size={13} /> {job.location}
                  </span>
                )}
                {job.contractType && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="clock" size={13} />{" "}
                    {job.contractType === "permanent"
                      ? "Indeterminato"
                      : job.contractType}
                  </span>
                )}
                {(job.salaryMin || job.salaryMax) && (
                  <span
                    className="mono inline-flex items-center gap-1"
                    style={{ color: "var(--fg)" }}
                  >
                    <Icon name="euro" size={13} />
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
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionHead
              icon={<span className="ds-dot ds-dot-green ds-dot-pulse" />}
              title="Auto-apply disponibile"
            />
            <SectionBody>
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  margin: "0 0 4px",
                }}
              >
                Candidati senza muoverti
              </h2>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--fg-muted)",
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                LavorAI ottimizza il tuo CV per questo annuncio e invia la
                candidatura su{" "}
                <span style={{ color: "var(--fg)" }}>
                  {portal === "linkedin" ? "LinkedIn" : portal === "indeed" ? "Indeed" : "InfoJobs"}
                </span>
                .
              </p>
              <ApplyButton jobId={job.id} portal={portal} />
              <div
                className="mt-4 flex flex-col gap-1.5"
                style={{
                  fontSize: 11.5,
                  color: "var(--fg-muted)",
                  paddingTop: 14,
                  borderTop: "1px solid var(--border-ds)",
                }}
              >
                <KV k="Tempo medio" v="~2 minuti" />
                <KV k="CV ottimizzato per il ruolo" v="Sì" />
                <KV k="Cover letter personalizzata" v="Sì" />
              </div>
            </SectionBody>
          </SectionCard>
        </div>

        <SectionCard className="mt-5">
          <SectionHead
            icon={<Icon name="file" size={14} />}
            title="Descrizione"
          />
          <SectionBody>
            <div
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "var(--fg)",
              }}
            >
              {job.description}
            </div>
            <div
              className="mt-5"
              style={{ fontSize: 11, color: "var(--fg-muted)" }}
            >
              Fonte:{" "}
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              >
                {job.source === "mock" ? "Mock data dev" : job.source}{" "}
                <Icon name="external" size={11} />
              </a>
            </div>
          </SectionBody>
        </SectionCard>
      </div>
    </>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{k}</span>
      <span style={{ color: "var(--fg)" }}>{v}</span>
    </div>
  );
}
