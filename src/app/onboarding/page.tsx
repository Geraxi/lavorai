import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extractProfile, type ExtractedProfile } from "@/lib/cv-profile";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { isApplicationAccessPaused } from "@/lib/billing";
import { isCardTrialCohort } from "@/lib/card-trial-policy";
import { hasCardTrialPreviewWindow, hasCardTrialPaidAccess } from "@/lib/card-trial-store";
import CardTrialOnboarding from "./card-trial-onboarding";
import OnboardingClient from "./onboarding-client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  // Auth guard già nel layout, ma TS needs narrowing
  if (!session?.user?.id) {
    return null;
  }

  // Onboarding viene prima della raccolta del metodo di pagamento: l'utente
  // deve poter caricare il CV e definire la ricerca prima di arrivare a
  // Stripe. L'app vera e propria resta comunque bloccata dal gate in `(app)`.
  const user = await getCurrentUser();
  const paidCardCohort = Boolean(user && isCardTrialCohort(user) && await hasCardTrialPaidAccess(user.id));
  if (user && isCardTrialCohort(user) && !paidCardCohort) {
    if (!(await hasCardTrialPreviewWindow(user.id))) redirect("/start-membership");
    const [cv, jobs] = await Promise.all([
      prisma.cVDocument.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { originalFilename: true } }),
      prisma.job.findMany({ where: { closedAt: null }, orderBy: [{ postedAt: "desc" }, { cachedAt: "desc" }], take: 20, select: { id: true, title: true, company: true, location: true, description: true } }),
    ]);
    return <CardTrialOnboarding locale={user.locale === "en" ? "en" : "it"} email={user.email} verified={Boolean(user.emailVerified)} initialFilename={cv?.originalFilename ?? null} jobs={jobs.map(job => ({ ...job, description: job.description.slice(0, 1400) }))} />;
  }
  if (user && !paidCardCohort && !isAdmin(user.email)) {
    if (isApplicationAccessPaused(user)) redirect("/trial-expired");
  }

  const cv = await prisma.cVDocument.findFirst({
    where: { userId: session.user.id },
    select: {
      id: true,
      originalFilename: true,
      extractedText: true,
      parsedProfileJson: true,
    },
    orderBy: { createdAt: "desc" },
  });

  let profile: ExtractedProfile | null = null;
  if (cv) {
    if (cv.parsedProfileJson) {
      try {
        profile = JSON.parse(cv.parsedProfileJson) as ExtractedProfile;
      } catch {
        // Corrotto → rigenera sotto
      }
    }
    if (!profile) {
      // Backfill one-time con il provider AI configurato
      try {
        const { extractProfileAI } = await import("@/lib/cv-profile-ai");
        profile = await extractProfileAI(
          cv.extractedText,
          session.user.email ?? null,
        );
        await prisma.cVDocument
          .update({
            where: { id: cv.id },
            data: { parsedProfileJson: JSON.stringify(profile) },
          })
          .catch(() => void 0);
      } catch {
        profile = extractProfile(cv.extractedText, session.user.email ?? null);
      }
    }
  }

  const initial = {
    cv: cv
      ? {
          filename: cv.originalFilename,
          chars: cv.extractedText.length,
          preview: cv.extractedText.slice(0, 600),
        }
      : null,
    profile,
  };

  return <OnboardingClient initial={initial} paidCardCohort={paidCardCohort} />;
}
