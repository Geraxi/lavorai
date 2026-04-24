import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Admin-only: ispeziona le candidature recenti di un utente per verificare
 * cosa è stato davvero inviato.
 *
 *   curl -s "https://lavorai.it/api/admin/inspect-apps?email=user@example.com&limit=20" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  const limit = Math.min(50, parseInt(url.searchParams.get("limit") ?? "20", 10));
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const apps = await prisma.application.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      job: {
        select: {
          title: true,
          company: true,
          source: true,
          url: true,
        },
      },
    },
  });

  return NextResponse.json({
    email,
    count: apps.length,
    apps: apps.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      status: a.status,
      submittedVia: a.submittedVia,
      errorMessage: a.errorMessage,
      viewedAt: a.viewedAt,
      atsScore: a.atsScore,
      portal: a.portal,
      jobTitle: a.job.title,
      company: a.job.company,
      source: a.job.source,
      jobUrl: a.job.url,
    })),
  });
}
