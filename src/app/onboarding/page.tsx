import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extractProfile, type ExtractedProfile } from "@/lib/cv-profile";
import OnboardingClient from "./onboarding-client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  // Auth guard già nel layout, ma TS needs narrowing
  if (!session?.user?.id) {
    return null;
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
      // Backfill one-time con Claude
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

  return <OnboardingClient initial={initial} />;
}
