import { explainMatch } from "@/lib/match-explanation";
import { scoreGhostJobs } from "@/lib/ghost-job-server";
import { DismissedJobs } from "@/components/dismissed-jobs";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AppTopbar } from "@/components/design/topbar";
import { JobSwiper, DiscoverHeading } from "@/components/job-swiper";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { discoverMatchScore } from "@/lib/discover-match-score";
import { getMatchingOpportunities } from "@/lib/dashboard-metrics-shared";
import "./discover.css";

export const metadata: Metadata = { title: "Scopri" };
export const dynamic = "force-dynamic";

/**
 * /discover — modalità swipe playful sui job recommendation.
 *
 * Stessi filtri della /jobs (ruoli, sede, salario, matchMin, avoid),
 * ma renderizzati uno alla volta in un card stack swipeable:
 *   swipe right / arrow right → applica
 *   swipe left / arrow left   → dismiss (owner-scoped and reversible)
 *
 * Niente refresh Adzuna costoso — pesca solo dalla cache job locale
 * (popolata dal cron sync-jobs ogni 2h). Veloce, leggera, low-cost.
 */
export default async function DiscoverPage({ searchParams }: { searchParams?: Promise<{ dismissed?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getTranslations("discoverPage");
  if ((await searchParams)?.dismissed === "1") {
    const dismissed = await prisma.jobDismissal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50, select: { job: { select: { id: true, title: true } } } });
    return <><AppTopbar title={t("title")} /><div className="workspace-page"><DismissedJobs jobs={dismissed.map(d => d.job)} en={(await getLocale()) === "en"} /></div></>;
  }

  // Same definition as the Dashboard "Scopri" card (dashboard-metrics-shared).
  const { total, jobs: matching, profile: userProfile } = await getMatchingOpportunities(user.id);
  const top = matching.slice(0, 50);
  const ghost = await scoreGhostJobs(top);
  const jobs = top
    .map((j) => ({
      explanation: explainMatch(userProfile, j.description),
      matchScore: discoverMatchScore(userProfile, `${j.title}\n${j.company ?? ""}\n${j.description}`),
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
      postedAt: j.postedAt,
      ghost: ghost.get(j.id),
    }));

  return (
    <>
      <AppTopbar title={t("title")} breadcrumb={t("breadcrumb")} />
      <div className="workspace-page workspace-discover pm-discover">
        <DiscoverHeading count={total} shown={jobs.length} />

        <JobSwiper jobs={jobs} />
      </div>
    </>
  );
}
