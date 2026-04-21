import type { Metadata } from "next";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import {
  SectionBody,
  SectionCard,
} from "@/components/design/section-card";
import { JobsList, type JobRow } from "@/components/jobs-list";
import { searchAndCacheJobs } from "@/lib/jobs-repo";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Job board" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ what?: string; where?: string; remote?: string }>;

function safeParseArray(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();

  // Default filters dalle preferenze dell'utente (se non override via querystring)
  let defaultWhat = "";
  let defaultWhere = "";
  let userSalaryMin: number | undefined;

  if (user) {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId: user.id },
    });
    if (prefs) {
      const roles = safeParseArray(prefs.rolesJson);
      const locations = safeParseArray(prefs.locationsJson);
      // Prima query: usa primo ruolo / prima città come default
      defaultWhat = roles[0] ?? "";
      defaultWhere =
        locations.find((l) => l.toLowerCase() !== "remoto") ?? locations[0] ?? "";
      userSalaryMin = prefs.salaryMin ? prefs.salaryMin * 1000 : undefined;
    }
  }

  const what = sp.what ?? defaultWhat;
  const where = sp.where ?? defaultWhere;
  const remoteOnly = sp.remote === "1";

  const jobsRaw = await searchAndCacheJobs({
    what: what || undefined,
    where: where || undefined,
    remoteOnly,
  });

  // Filtra per salary minima utente (se nota)
  const jobs: JobRow[] = jobsRaw
    .filter((j) => {
      if (!userSalaryMin) return true;
      if (!j.salaryMax && !j.salaryMin) return true; // dato mancante → non scartare
      const top = j.salaryMax ?? j.salaryMin ?? 0;
      return top >= userSalaryMin;
    })
    .map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      description: j.description,
      url: j.url,
      contractType: j.contractType,
      remote: j.remote,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
    }));

  return (
    <>
      <AppTopbar title="Job board" breadcrumb="Lavoro" />
      <div
        style={{
          padding: "24px 32px 80px",
          maxWidth: 1480,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div className="mb-6">
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.022em",
              margin: 0,
            }}
          >
            Job board
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}>
            {defaultWhat && !sp.what
              ? `Filtrato sulle tue preferenze · ${jobs.length} posizioni`
              : `${jobs.length} posizioni trovate`}
          </p>
        </div>

        <form
          className="mb-5 flex items-center gap-2 rounded border p-2"
          style={{
            background: "var(--bg-elev)",
            borderColor: "var(--border-ds)",
          }}
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
              defaultValue={what}
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
              defaultValue={where}
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
              defaultChecked={remoteOnly}
            />{" "}
            Solo remoto
          </label>
          <button type="submit" className="ds-btn ds-btn-primary">
            Cerca
          </button>
        </form>

        {jobs.length > 0 ? (
          <JobsList jobs={jobs} />
        ) : (
          <SectionCard>
            <SectionBody>
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <Icon
                  name="inbox"
                  size={28}
                  style={{ color: "var(--fg-subtle)" }}
                />
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
                  Prova a rimuovere qualche filtro o a modificare le tue
                  preferenze.
                </div>
              </div>
            </SectionBody>
          </SectionCard>
        )}
      </div>
    </>
  );
}
