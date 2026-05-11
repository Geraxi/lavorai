import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppTopbar } from "@/components/design/topbar";
import { JobSwiper } from "@/components/job-swiper";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { titleMatchesAnyRole } from "@/lib/role-match";
import type { JobRow } from "@/components/jobs-list";

export const metadata: Metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

/**
 * /discover — modalità swipe playful sui job recommendation.
 *
 * Stessi filtri della /jobs (ruoli, sede, salario, matchMin, avoid),
 * ma renderizzati uno alla volta in un card stack swipeable:
 *   swipe right / arrow right → applica
 *   swipe left / arrow left   → skip (memo localStorage)
 *
 * Niente refresh Adzuna costoso — pesca solo dalla cache job locale
 * (popolata dal cron sync-jobs ogni 2h). Veloce, leggera, low-cost.
 */
export default async function DiscoverPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getTranslations("discoverPage");

  const [prefs, full] = await Promise.all([
    prisma.userPreferences.findUnique({
      where: { userId: user.id },
      select: {
        rolesJson: true,
        locationsJson: true,
        salaryMin: true,
        matchMin: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        avoidCompanies: true,
        cvProfile: true,
      },
    }),
  ]);

  // Parse user preferences
  const prefRoles: string[] = (() => {
    try {
      const arr = JSON.parse(prefs?.rolesJson ?? "[]");
      return Array.isArray(arr)
        ? arr.filter((x) => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  })();
  const userSalaryMin = prefs?.salaryMin ?? 0;
  const matchMin = prefs?.matchMin ?? 0;
  const avoidSet = new Set(
    (full?.avoidCompanies ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const userProfile = full?.cvProfile ? rowToProfile(full.cvProfile) : null;

  // Pesca dalla cache: ultimi 14 giorni, fino a 300 job, ordinati per data
  const jobsRaw = await prisma.job.findMany({
    where: {
      cachedAt: { gte: new Date(Date.now() - 14 * 86400_000) },
      source: {
        in: ["greenhouse", "lever", "ashby", "smartrecruiters", "linkedin"],
      },
      // Escludi job già candidati dall'utente
      NOT: {
        applications: {
          some: {
            userId: user.id,
            status: { in: ["success", "queued", "optimizing", "applying"] },
          },
        },
      },
    },
    orderBy: { postedAt: "desc" },
    take: 300,
  });

  // Applica gli stessi filtri di /jobs
  const jobs: JobRow[] = jobsRaw
    .filter((j) => {
      if (prefRoles.length > 0 && !titleMatchesAnyRole(j.title, prefRoles))
        return false;
      if (j.company && avoidSet.has(j.company.toLowerCase())) return false;
      if (userSalaryMin) {
        const top = j.salaryMax ?? j.salaryMin ?? 0;
        if (top > 0 && top < userSalaryMin) return false;
      }
      if (matchMin > 0 && userProfile) {
        const score = quickMatchScore(
          userProfile,
          `${j.title}\n${j.company ?? ""}\n${j.description}`,
        );
        if (score < matchMin) return false;
      }
      return true;
    })
    .slice(0, 50)
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
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div className="mb-5">
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.022em",
              margin: 0,
            }}
          >
            {t("heading")}
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--fg-muted)",
              marginTop: 4,
            }}
          >
            {t("subtitle", { count: jobs.length })}
          </p>
        </div>

        <JobSwiper jobs={jobs} />
      </div>
    </>
  );
}
