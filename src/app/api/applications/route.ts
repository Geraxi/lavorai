import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/applications?range=today|week|month|all&includeAll=1
 *
 * Default: SOLO candidature realmente inviate (status=success) — le
 * altre (ready_to_apply, applying, failed, awaiting_consent, queued, ecc.)
 * non sono state consegnate al recruiter. Per vedere l'intero pipeline
 * passare `includeAll=1` (usato dalla vista awaiting-consent).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ applications: [] });
  }

  const range = request.nextUrl.searchParams.get("range") ?? "all";
  const includeAll = request.nextUrl.searchParams.get("includeAll") === "1";
  let since: Date | null = null;
  const now = new Date();
  if (range === "today") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === "week") {
    since = new Date(now.getTime() - 7 * 86400_000);
  } else if (range === "month") {
    since = new Date(now.getTime() - 30 * 86400_000);
  }

  const applications = await prisma.application.findMany({
    where: {
      userId: user.id,
      ...(since ? { createdAt: { gte: since } } : {}),
      // Di default mostriamo solo le candidature effettivamente inviate
      // (una delle vie: portal_*, email_recruiter). Se includeAll=1,
      // torniamo tutto il pipeline per la UI awaiting-consent.
      ...(includeAll
        ? {}
        : { status: "success", submittedVia: { not: null } }),
    },
    orderBy: { createdAt: "desc" },
    take: 500, // safety upper bound
    include: {
      job: {
        select: {
          id: true,
          title: true,
          company: true,
          location: true,
          url: true,
          source: true,
        },
      },
    },
  });

  return NextResponse.json({
    applications: applications.map((a) => ({
      id: a.id,
      status: a.status,
      portal: a.portal,
      errorMessage: a.errorMessage,
      atsScore: a.atsScore,
      suggestions: a.suggestionsJson
        ? (JSON.parse(a.suggestionsJson) as string[])
        : [],
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
      coverLetterText: a.coverLetterText,
      hasCvDocx: Boolean(a.cvDocxPath),
      hasCoverLetterDocx: Boolean(a.coverLetterPath),
      hasCvPdf: Boolean(a.cvPdfPath),
      cvLanguage: a.cvLanguage,
      userStatus: a.userStatus,
      viewedAt: a.viewedAt?.toISOString() ?? null,
      job: a.job,
    })),
  });
}
