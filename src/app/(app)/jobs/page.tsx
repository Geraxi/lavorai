import type { Metadata } from "next";
import Link from "next/link";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import { searchAndCacheJobs } from "@/lib/jobs-repo";

export const metadata: Metadata = { title: "Job board" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ what?: string; where?: string; remote?: string }>;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const jobs = await searchAndCacheJobs({
    what: sp.what,
    where: sp.where,
    remoteOnly: sp.remote === "1",
  });

  return (
    <>
      <AppTopbar title="Job board" breadcrumb="Lavoro" />
      <div style={{ padding: "24px 32px 80px", maxWidth: 1480, width: "100%", margin: "0 auto" }}>
        <div className="mb-6">
          <h1
            style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.022em", margin: 0 }}
          >
            Job board
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}>
            Annunci compatibili con le tue preferenze · {jobs.length} trovati
          </p>
        </div>

        <form
          className="mb-5 flex items-center gap-2 rounded border p-2"
          style={{ background: "var(--bg-elev)", borderColor: "var(--border-ds)" }}
        >
          <div className="relative flex-1">
            <Icon
              name="search"
              size={14}
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--fg-subtle)",
              }}
            />
            <input
              name="what"
              defaultValue={sp.what ?? ""}
              className="ds-input"
              placeholder="Ruolo, azienda, keyword..."
              style={{ paddingLeft: 32 }}
            />
          </div>
          <div className="relative" style={{ width: 240 }}>
            <Icon
              name="map-pin"
              size={14}
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--fg-subtle)",
              }}
            />
            <input
              name="where"
              defaultValue={sp.where ?? ""}
              className="ds-input"
              placeholder="Città"
              style={{ paddingLeft: 32 }}
            />
          </div>
          <label
            className="flex items-center gap-1.5 px-2"
            style={{ fontSize: 12, color: "var(--fg-muted)" }}
          >
            <input
              type="checkbox"
              name="remote"
              value="1"
              defaultChecked={sp.remote === "1"}
            />{" "}
            Solo remoto
          </label>
          <button type="submit" className="ds-btn ds-btn-primary">
            Cerca
          </button>
        </form>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {jobs.map((j) => {
            const color = companyColor(j.company ?? j.title);
            return (
              <Link key={j.id} href={`/jobs/${j.id}`}>
                <SectionCard className="h-full transition-colors hover:border-[var(--fg)]">
                  <SectionBody>
                    <div className="flex items-start gap-2.5">
                      <CompanyLogo company={j.company ?? j.title} color={color} size={34} />
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
                        <span className="ds-chip ds-chip-green">Remoto</span>
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
                            ? "Indeterminato"
                            : j.contractType}
                        </span>
                      )}
                      {(j.salaryMin || j.salaryMax) && (
                        <span
                          className="mono inline-flex items-center gap-1"
                          style={{ color: "var(--fg)" }}
                        >
                          <Icon name="euro" size={11} />
                          {j.salaryMin ? `€${Math.round(j.salaryMin / 1000)}k` : ""}
                          {j.salaryMin && j.salaryMax ? "–" : ""}
                          {j.salaryMax ? `€${Math.round(j.salaryMax / 1000)}k` : ""}
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
                  </SectionBody>
                </SectionCard>
              </Link>
            );
          })}
        </div>

        {jobs.length === 0 && (
          <SectionCard>
            <SectionBody>
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <Icon name="inbox" size={28} style={{ color: "var(--fg-subtle)" }} />
                <div style={{ marginTop: 12, fontWeight: 500 }}>
                  Nessun annuncio trovato
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--fg-muted)",
                    marginTop: 4,
                  }}
                >
                  Prova a rimuovere qualche filtro.
                </div>
              </div>
            </SectionBody>
          </SectionCard>
        )}
      </div>
    </>
  );
}
