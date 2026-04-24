import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Admin one-shot: azzera le candidature inviate a recruiter email che
 * sappiamo essere bogus (Sentry DSN, unicode-artifact), così la pipeline
 * può essere rilanciata dopo il fix dello scraper. Ripristina anche
 * Job.recruiterEmail così il prossimo tentativo rifà lo scrape pulito.
 *
 *   curl -X POST "https://lavorai.it/api/admin/reset-bogus-sends" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Trova le Application inviate via email a indirizzi chiaramente bogus
  const bogusPattern =
    // sentry DSN / unicode artifact / malformed
    /@(.*\.)?ingest\..*sentry\.io$|^u[0-9a-f]{4}@|^[0-9a-f]{24,}@/i;

  // Non possiamo filtrare direttamente in Prisma con regex complessa.
  // Prendiamo tutte le email-sent apps e filtriamo in memoria.
  const apps = await prisma.application.findMany({
    where: {
      submittedVia: "email_recruiter",
    },
    include: {
      job: { select: { id: true, recruiterEmail: true } },
    },
  });

  const bogusApps = apps.filter((a) => {
    const em = a.job.recruiterEmail ?? "";
    return bogusPattern.test(em);
  });

  const appIds = bogusApps.map((a) => a.id);
  const jobIds = Array.from(new Set(bogusApps.map((a) => a.job.id)));

  // 1) Reset le Application → ready_to_apply (utente può ritentare)
  await prisma.application.updateMany({
    where: { id: { in: appIds } },
    data: {
      status: "ready_to_apply",
      submittedVia: null,
      completedAt: null,
      errorMessage:
        "Invio annullato: destinatario scraped non era un recruiter reale (bug scraper). Puoi ri-candidarti.",
    },
  });

  // 2) Azzera Job.recruiterEmail + recruiterScrapedAt così il prossimo
  //    tentativo ri-scrape con la blacklist aggiornata
  await prisma.job.updateMany({
    where: { id: { in: jobIds } },
    data: {
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
  });

  return NextResponse.json({
    ok: true,
    resetApplications: appIds.length,
    clearedJobs: jobIds.length,
    sample: bogusApps.slice(0, 5).map((a) => ({
      id: a.id,
      email: a.job.recruiterEmail,
    })),
  });
}
