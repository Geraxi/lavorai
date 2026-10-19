import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppTopbar } from "@/components/design/topbar";
import Link from "next/link";
import { MapPin, Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui-premium/empty-state";
import { getMatchingOpportunities, getMatchingOpportunityCount } from "@/lib/dashboard-metrics-shared";
import "./jobs.css";
import { JobsList, type JobRow } from "@/components/jobs-list";
import { searchAndCacheJobs } from "@/lib/jobs-repo";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { titleMatchesAnyRole } from "@/lib/role-match";
import { PROTECTED_SEARCH_PHRASES } from "@/lib/protected-category";

export const metadata: Metadata = { title: "Offerte di lavoro" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ what?: string; where?: string; remote?: string; protected?: string; mode?: string }>;

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
  let prefProtected = false;
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
      prefProtected = prefs.protectedCategory;
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
  // Categorie protette (L. 68/99): esplicito via ?protected=1|0, altrimenti
  // dalla preferenza dell'utente.
  const protectedOnly = sp.protected != null ? sp.protected === "1" : prefProtected;

  // Default view (no explicit search): exactly the "per te" set shared with
  // Dashboard and Scopri, so the three pages show the same number.
  const isSearch = sp.mode === "search" || !!(sp.what || sp.where || sp.remote || sp.protected != null || prefProtected);
  if (user && !isSearch) {
    const matching = await getMatchingOpportunities(user.id);
    return (
      <JobsFrame title={t("title")} breadcrumb={t("breadcrumb")} subtitle={`${t("forYouCount", { count: matching.total })}`} what="" where="" remoteOnly={false} protectedOnly={false} t={t} isSearch={false} forYou={matching.total}>
        {matching.total > 0
          ? <JobsList jobs={matching.jobs.map(toRow)} label={t("forYouLabel")} />
          : <JobsEmpty title={t("noForYou")} text={t("noForYouHint")} />}
      </JobsFrame>
    );
  }
  const forYou = user ? await getMatchingOpportunityCount(user.id) : 0;

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
      // Downgrade a warn: errori upstream (Adzuna 429, fetch transient)
      // sono recuperabili via fallback DB e non devono triggerare il
      // dev error overlay di Next.js.
      console.warn("[jobs] search failed for", params, err instanceof Error ? err.message : err);
      return [];
    }
  }

  // Annunci per categorie protette: ricerca dedicata per frase esatta su
  // Adzuna (in aggiunta ai ruoli), poi filtro in DB su protectedCategory.
  if (protectedOnly) {
    const extra = await Promise.all(
      PROTECTED_SEARCH_PHRASES.map((p) => safeSearch({ whatPhrase: p, what: what || undefined, where: where || undefined, remoteOnly, protectedOnly: true, resultsPerPage: 50 })),
    );
    for (const list of extra) for (const j of list) jobsRaw.push(j);
  }

  if (what) {
    jobsRaw = [...jobsRaw, ...(await safeSearch({
      what,
      where: where || undefined,
      remoteOnly,
      protectedOnly,
    }))];
  } else if (prefRoles.length > 0) {
    // Cap a 5 ruoli per contenere il consumo dell'API (Adzuna free: 1000/mese)
    const rolesToQuery = prefRoles.slice(0, 5);
    const results = await Promise.all(
      rolesToQuery.map((r) =>
        safeSearch({
          what: r,
          where: where || undefined,
          remoteOnly,
          protectedOnly,
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
    jobsRaw = [...jobsRaw, ...(await safeSearch({
      where: where || undefined,
      remoteOnly,
      protectedOnly,
    }))];
  }
  // Dedup (le ricerche dedicate possono sovrapporsi) + ordine per data.
  {
    const seen = new Set<string>();
    jobsRaw = jobsRaw.filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
    jobsRaw.sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0));
  }

  let belowMatchCount = 0;
  let roleMismatchCount = 0;
  // Con il filtro categorie protette non imponiamo il match sul titolo:
  // gli annunci riservati sono pochi e spesso trasversali ai ruoli.
  const enforceRoles = !sp.what && prefRoles.length > 0 && !protectedOnly;
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
    .map(toRow);

  // Mark roles the user already applied to (search can include them).
  const applied = user && jobs.length
    ? new Set((await prisma.application.findMany({ where: { userId: user.id, jobId: { in: jobs.map((j) => j.id) } }, select: { jobId: true } })).map((a) => a.jobId))
    : new Set<string>();
  const summary = [
    t("searchCount", { count: jobs.length }),
    matchMin > 0 ? t("matchAtLeast", { pct: matchMin }) : null,
    belowMatchCount > 0 ? t("hiddenBelowThreshold", { count: belowMatchCount }) : null,
    roleMismatchCount > 0 ? t("outOfRole", { count: roleMismatchCount }) : null,
  ].filter(Boolean).join(" · ");
  return (
    <JobsFrame title={t("title")} breadcrumb={t("breadcrumb")} subtitle={summary} what={what} where={where} remoteOnly={remoteOnly} protectedOnly={protectedOnly} t={t} isSearch forYou={forYou}>
      {jobs.length > 0
        ? <JobsList jobs={jobs} label={t("searchLabel")} alreadyApplied={[...applied]} />
        : <JobsEmpty title={t("noResults")} text={t("noResultsHint")} />}
    </JobsFrame>
  );
}

type Row = { id: string; title: string; company: string | null; location: string | null; description: string; url: string; contractType: string | null; remote: boolean; salaryMin: number | null; salaryMax: number | null; protectedCategory?: boolean };
function toRow(j: Row): JobRow {
  return { id: j.id, title: j.title, company: j.company, location: j.location, description: j.description, url: j.url, contractType: j.contractType, remote: j.remote, salaryMin: j.salaryMin, salaryMax: j.salaryMax, protectedCategory: j.protectedCategory };
}

function JobsEmpty({ title, text }: { title: string; text: string }) {
  return (
    <section className="pm-card">
      <EmptyState icon={SearchX} title={title} text={text} cta={{ href: "/preferences", label: "Modifica preferenze" }} />
    </section>
  );
}

function JobsFrame({ title, breadcrumb, subtitle, what, where, remoteOnly, protectedOnly, isSearch, forYou, t, children }: {
  title: string; breadcrumb: string; subtitle: string; what: string; where: string; remoteOnly: boolean; protectedOnly: boolean;
  isSearch: boolean; forYou: number; t: Awaited<ReturnType<typeof getTranslations<"jobsPage">>>; children: React.ReactNode;
}) {
  return (
    <>
      <AppTopbar title={title} breadcrumb={breadcrumb} />
      <div className="pm-page jobs-page">
        <header className="pm-page-head">
          <div>
            <h1>{title}</h1>
            <p className="pm-muted">{subtitle}</p>
          </div>
          <nav className="pm-seg" aria-label={t("modeLabel")}>
            <Link href="/jobs" aria-current={!isSearch ? "page" : undefined}>{t("forYouTab")} <span className="jobs-seg-count">{forYou}</span></Link>
            <Link href="/jobs?mode=search" aria-current={isSearch ? "page" : undefined}>{t("searchTab")}</Link>
          </nav>
        </header>
        <form className="pm-card jobs-search" action="/jobs">
          <input type="hidden" name="mode" value="search" />
          <label className="jobs-field">
            <Search size={14} aria-hidden />
            <input name="what" defaultValue={what} className="ds-input" placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} />
          </label>
          <label className="jobs-field is-where">
            <MapPin size={14} aria-hidden />
            <input name="where" defaultValue={where} className="ds-input" placeholder={t("locationPlaceholder")} aria-label={t("locationPlaceholder")} />
          </label>
          <label className="jobs-check"><input type="checkbox" name="remote" value="1" defaultChecked={remoteOnly} /> {t("remoteOnly")}</label>
          <label className="jobs-check" title="Solo annunci riservati o prioritari per le categorie protette (L. 68/99)"><input type="checkbox" name="protected" value="1" defaultChecked={protectedOnly} /> {t("protectedLabel")}</label>
          <button type="submit" className="pm-btn-ghost">{t("search")}</button>
        </form>
        {children}
        <p className="pm-muted jobs-foot">{t("forYouDefinition")}</p>
      </div>
    </>
  );
}
