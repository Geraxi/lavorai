import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extractProfile, type ExtractedProfile } from "@/lib/cv-profile";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { onboardingAccessBlock } from "@/lib/onboarding-access";
import OnboardingClient from "./onboarding-client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  // Auth guard già nel layout, ma TS needs narrowing
  if (!session?.user?.id) {
    return null;
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const block = onboardingAccessBlock(user);
  if (block) redirect(block.redirect);

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

  const saved = await prisma.user.findUnique({ where: { id: user.id }, select: { demoPreviewJson: true, preferences: true, seniority: true, yearsExperience: true, englishLevel: true, italianNative: true, euAuthorized: true, noticePeriod: true, avoidCompanies: true } });
  const initial = {
    saved: saved ? { rolesJson: saved.preferences?.rolesJson, locationsJson: saved.preferences?.locationsJson, sourcesJson: saved.preferences?.sourcesJson, salaryMin: saved.preferences?.salaryMin, employmentType: saved.preferences?.employmentType, dailyRate: saved.preferences?.dailyRate, availableFrom: saved.preferences?.availableFrom, portfolioUrl: saved.preferences?.portfolioUrl, seniority: saved.seniority, yearsExperience: saved.yearsExperience, englishLevel: saved.englishLevel, italianNative: saved.italianNative, euAuthorized: saved.euAuthorized, noticePeriod: saved.noticePeriod, avoidCompanies: saved.avoidCompanies } : null,
    demo: saved?.demoPreviewJson ? JSON.parse(saved.demoPreviewJson) : null,
    cv: cv
      ? {
          filename: cv.originalFilename,
          chars: cv.extractedText.length,
          preview: cv.extractedText.slice(0, 600),
        }
      : null,
    profile,
  };

  return <OnboardingClient initial={initial} />;
}
