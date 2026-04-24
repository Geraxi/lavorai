import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Admin read-only: elenca email inviate recentemente (EmailLog) +
 * applicazioni consegnate via email con Resend — per capire recapiti
 * reali + eventuali bounce/spam.
 *
 *   curl -s "https://lavorai.it/api/admin/inspect-emails?email=user@example.com" \
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
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Email inviate dalla piattaforma (EmailLog) — filtriamo per recipient
  // o destinatari correlati all'utente. EmailLog salva `to` grezzo.
  const recentLogs = await prisma.emailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  // Applications inviate via email per questo utente con dettaglio
  // recruiter email dal Job collegato
  const apps = await prisma.application.findMany({
    where: {
      userId: user.id,
      submittedVia: "email_recruiter",
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      job: {
        select: {
          title: true,
          company: true,
          recruiterEmail: true,
        },
      },
    },
  });

  return NextResponse.json({
    userEmail: email,
    deliveredViaEmail: apps.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      viewedAt: a.viewedAt,
      status: a.status,
      jobTitle: a.job.title,
      company: a.job.company,
      recruiterEmail: a.job.recruiterEmail,
    })),
    recentEmailLogs: recentLogs.map((l) => ({
      kind: l.kind,
      to: l.to,
      createdAt: l.createdAt,
    })),
  });
}
