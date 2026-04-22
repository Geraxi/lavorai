import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ applications: [] });
  }

  const applications = await prisma.application.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
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
