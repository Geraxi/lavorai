import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { titleMatchesAnyRole } from "@/lib/role-match";

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
  const t = await getTranslations("jobsPage");

  // Default filters dalle preferenze dell'utente (se non override via querystring)
  let prefRoles: string[] = [];
  let defaultWhere = "";
  let userSalaryMin: number | undefined;
  let avoidSet = new Set<string>();
  let matchMin = 0;
  let userProfile: ReturnType<typeof rowToProfile> | null = null;

  if (user) {
    const [prefs, full, profileRow] = await Promise.all([
      prisma.userPreferences.findUnique({ where: { userId: user.id } }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { avoidCompanies: true },
      }),
      prisma.cVProfile.findUnique({ where: { userId: user.id } }),
    ]);
    if (prefs) {
      prefRoles = safeParseArray(prefs.rolesJson);
      const locations = safeParseArray(prefs.locationsJson);
      defaultWhere =
        locations.find((l) => l.toLowerCase() !== "remoto") ??
        locations[0] ??
        "";
      userSalaryMin = prefs.salaryMin ? prefs.salaryMin * 1000 : undefined;
      matchMin = prefs.matchMin ?? 0;
    }
    avoidSet = new Set(
      (full?.avoidCompanies ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    if (profileRow) userProfile = rowToProfile(profileRow);
  }

  const what = sp.what ?? "";
  const where = sp.where ?? defaultWhere;
  const remoteOnly = sp.remote === "1";

  // Se l'utente ha esplicitamente cercato (sp.what), usa solo quello.
  // Altrimenti, se ha preferenze multi-ruolo, query una volta per ciascun
  // ruolo e dedupa per non mostrare solo il primo.
  let jobsRaw: Awaited<ReturnType<typeof searchAndCacheJobs>> = [];
  async function safeSearch(
    params: Parameters<typeof searchAndCacheJobs>[0],
  ): Promise<Awaited<ReturnType<typeof searchAndCacheJobs>>> {
    try {
      return await searchAndCacheJobs(params);
    } catch (err) {
      console.error("[jobs] search failed for", params, err);
      return [];
    }
  }

  if (what) {
    jobsRaw = await safeSearch({
      what,
      where: where || undefined,
      remoteOnly,
    });
  } else if (prefRoles.length > 0) {
    // Cap a 5 ruoli per contenere il consumo dell'API (Adzuna free: 1000/mese)
    const rolesToQuery = prefRoles.slice(0, 5);
    const results = await Promise.all(
      rolesToQuery.map((r) =>
        safeSearch({
          what: r,
          where: where || undefined,
          remoteOnly,
        }),
      ),
    );
    const seen = new Set<string>();
    for (const list of results) {
      for (const j of list) {
        if (seen.has(j.id)) continue;
        seen.add(j.id);
        jobsRaw.push(j);
      }
    }
    // Ordina per data pubblicazione più recente
    jobsRaw.sort((a, b) => {
      const aTime = a.postedAt ? a.postedAt.getTime() : 0;
      const bTime = b.postedAt ? b.postedAt.getTime() : 0;
      return bTime - aTime;
    });
  } else {
    // Nessuna preferenza e nessuna ricerca → mostra una generica
    jobsRaw = await safeSearch({
      where: where || undefined,
      remoteOnly,
    });
  }

  let belowMatchCount = 0;
  let roleMismatchCount = 0;
  const enforceRoles = !sp.what && prefRoles.length > 0;
  const jobs: JobRow[] = jobsRaw
    .filter((j) => {
      // 0. titolo deve matchare uno dei ruoli dichiarati (solo quando
      //    non c'è una query esplicita dell'utente)
      if (enforceRoles && !titleMatchesAnyRole(j.title, prefRoles)) {
        roleMismatchCount++;
        return false;
      }
      // 1. aziende escluse
      if (j.company && avoidSet.has(j.company.toLowerCase())) return false;
      // 2. salario minimo (solo se noto)
      if (userSalaryMin) {
        const top = j.salaryMax ?? j.salaryMin ?? 0;
        if (top > 0 && top < userSalaryMin) return false;
      }
      // 3. match score minimo (se profilo + soglia settati)
      if (matchMin > 0 && userProfile) {
        const score = quickMatchScore(
          userProfile,
          `${j.title}\n${j.company ?? ""}\n${j.description}`,
        );
        if (score < matchMin) {
          belowMatchCount++;
          return false;
        }
      }
      return true;
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
      <AppTopbar title={t("title")} breadcrumb={t("breadcrumb")} />
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
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.022em",
              margin: 0,
            }}
          >
            {t("title")}
          </h1>
          <p style={{ fontSize: 15, color: "var(--fg-muted)", marginTop: 6 }}>
            {!sp.what && prefRoles.length > 0
              ? `${t("compatiblePositions", { count: jobs.length })}${matchMin > 0 ? ` (${t("matchAtLeast", { pct: matchMin })})` : ""}${belowMatchCount > 0 ? ` · ${t("hiddenBelowThreshold", { count: belowMatchCount })}` : ""}${roleMismatchCount > 0 ? ` · ${t("outOfRole", { count: roleMismatchCount })}` : ""}`
              : t("foundPositions", { count: jobs.length })}
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
              placeholder={t("searchPlaceholder")}
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
              placeholder={t("locationPlaceholder")}
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
            {t("remoteOnly")}
          </label>
          <button type="submit" className="ds-btn ds-btn-primary">
            {t("search")}
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
                  {t("noResults")}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--fg-muted)",
                    marginTop: 4,
                  }}
                >
                  {t("noResultsHint")}
                </div>
              </div>
            </SectionBody>
          </SectionCard>
        )}
      </div>
    </>
  );
}
