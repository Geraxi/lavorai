import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { processApplication } from "@/lib/application-worker";
import { findPortalAdapter } from "@/lib/portal-adapters";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/test-apply
 * Esegue UNA candidatura end-to-end DIRETTAMENTE su Vercel (in-process,
 * bypassando la coda BullMQ) per verificare che l'intero pipeline —
 * generazione CV + adapter ATS + Chromium — funzioni su serverless.
 *
 * Sicurezza: con PORTAL_SUBMIT_DRY_RUN=true il form viene compilato ma NON
 * inviato (confirmation=DRY_RUN). Nessuna candidatura reale parte.
 *
 * Body opzionale: { applicationId }. Se assente, sceglie una candidatura
 * ready_to_apply del founder su un portale supportato (greenhouse/ashby/…).
 * Admin-only.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { applicationId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body opzionale
  }

  const dryRun = process.env.PORTAL_SUBMIT_DRY_RUN === "true";
  const portalEnabled = process.env.PORTAL_SUBMIT_ENABLED === "true";

  // Trova la candidatura da testare.
  let appId = body.applicationId?.trim();
  if (!appId) {
    // Auto-pick: una ready_to_apply del founder su portale con adapter.
    const candidates = await prisma.application.findMany({
      where: {
        userId: user!.id,
        status: { in: ["ready_to_apply", "failed"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, job: { select: { url: true, title: true, company: true } } },
    });
    const match = candidates.find((c) => findPortalAdapter(c.job.url));
    if (!match) {
      return NextResponse.json({
        ok: false,
        message:
          "Nessuna candidatura ready_to_apply su un portale supportato (greenhouse/ashby/lever/…). Passa un applicationId esplicito.",
      });
    }
    appId = match.id;
  }

  const before = await prisma.application.findUnique({
    where: { id: appId },
    select: { id: true, job: { select: { url: true, title: true, company: true } } },
  });
  if (!before) {
    return NextResponse.json({ ok: false, message: "Application non trovata." }, { status: 404 });
  }
  const adapter = findPortalAdapter(before.job.url);

  const t0 = Date.now();
  let runError: string | null = null;
  try {
    await processApplication(appId);
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
  }

  const after = await prisma.application.findUnique({
    where: { id: appId },
    select: {
      status: true,
      submittedVia: true,
      submitConfirmation: true,
      errorMessage: true,
      canaryLog: true,
      atsScore: true,
    },
  });

  return NextResponse.json({
    ok: !runError,
    dryRun,
    portalEnabled,
    applicationId: appId,
    job: `${before.job.title}${before.job.company ? ` @ ${before.job.company}` : ""}`,
    adapter: adapter?.id ?? "(nessuno — andrà via email/fallback)",
    ms: Date.now() - t0,
    runError,
    result: {
      status: after?.status,
      submittedVia: after?.submittedVia,
      submitConfirmation: after?.submitConfirmation,
      atsScore: after?.atsScore,
      errorMessage: after?.errorMessage,
      canaryCaptured: !!after?.canaryLog,
      canaryExcerpt: after?.canaryLog?.slice(0, 600) ?? null,
    },
  });
}
