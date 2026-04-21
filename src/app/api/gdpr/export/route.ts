import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GDPR Art.15/20 — Export dati utente in JSON.
 * Solo i dati del richiedente. Richiede sessione.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const [full, cvDocs, applications, preferences] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        name: true,
        createdAt: true,
        tier: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        welcomeSeenAt: true,
        onboardedAt: true,
        lastLoginAt: true,
        privacyConsentAt: true,
        seniority: true,
        yearsExperience: true,
        englishLevel: true,
        italianNative: true,
        euAuthorized: true,
        noticePeriod: true,
        avoidCompanies: true,
      },
    }),
    prisma.cVDocument.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        originalFilename: true,
        extractedText: true,
        parsedProfileJson: true,
        createdAt: true,
      },
    }),
    prisma.application.findMany({
      where: { userId: user.id },
      include: { job: true },
    }),
    prisma.userPreferences.findUnique({
      where: { userId: user.id },
    }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    format: "LavorAI GDPR Export v1",
    user: full,
    cvDocuments: cvDocs,
    applications,
    preferences,
  };

  const json = JSON.stringify(exportData, null, 2);
  const filename = `lavorai-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(json, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
