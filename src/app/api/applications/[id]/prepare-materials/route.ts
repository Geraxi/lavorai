import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { processApplication } from "@/lib/application-worker";
import { isSkippedPortalUrl } from "@/lib/ats-skip-hosts";
import { materialPreparationRequestJson } from "@/lib/application-material-preparation";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Retry a manual-ATS handoff solely to create its tailored materials.
 * This endpoint deliberately cannot send: it only accepts untouched rows and
 * the worker keeps the ATS in its manual handoff path after generation.
 *
 * It runs in the Vercel request itself rather than relying on the separate
 * browser worker: document generation does not need Playwright, and this
 * route never attempts a portal or email delivery.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const app = await prisma.application.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true, status: true, suggestionsJson: true, cvDocxPath: true,
      coverLetterPath: true, submittedAt: true, submittedVia: true,
      submitStartedAt: true, submitClickPerformedAt: true,
      outboundSubmissionJson: true, submissionReceiptJson: true,
      job: { select: { url: true } },
    },
  });
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isSkippedPortalUrl(app.job.url)) {
    return NextResponse.json({ error: "not_manual_ats", message: "I materiali vengono preparati automaticamente per questo portale." }, { status: 409 });
  }
  if (app.cvDocxPath && app.coverLetterPath) {
    return NextResponse.json({ ok: true, alreadyPrepared: true });
  }
  if (app.submittedAt || app.submittedVia || app.submitStartedAt || app.submitClickPerformedAt || app.outboundSubmissionJson || app.submissionReceiptJson) {
    return NextResponse.json({ error: "submission_state_uncertain", message: "Non possiamo ripreparare una candidatura con un tentativo di invio da verificare." }, { status: 409 });
  }

  const updated = await prisma.application.updateMany({
    where: {
      id: app.id,
      userId: user.id,
      submittedAt: null,
      submittedVia: null,
      submitStartedAt: null,
      submitClickPerformedAt: null,
      outboundSubmissionJson: null,
      submissionReceiptJson: null,
    },
    data: {
      status: "queued",
      suggestionsJson: materialPreparationRequestJson(),
      errorMessage: null,
      completedAt: null,
      startedAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
  if (updated.count !== 1) return NextResponse.json({ error: "state_changed" }, { status: 409 });

  await processApplication(app.id);

  const prepared = await prisma.application.findUnique({
    where: { id: app.id },
    select: {
      status: true,
      cvDocxPath: true,
      coverLetterPath: true,
      cvPdfPath: true,
      errorMessage: true,
      submittedAt: true,
      submittedVia: true,
    },
  });
  if (!prepared?.cvDocxPath || !prepared.coverLetterPath) {
    return NextResponse.json({
      error: "material_generation_failed",
      message: prepared?.errorMessage ?? "I materiali non sono stati generati. Riprova tra qualche istante.",
      status: prepared?.status ?? "unknown",
    }, { status: 500 });
  }
  // Defensive invariant for this route: it prepares files only. A delivery
  // record would be a bug and must never be presented as successful prep.
  if (prepared.submittedAt || prepared.submittedVia) {
    return NextResponse.json({ error: "unexpected_delivery_state" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    status: prepared.status,
    cvPdfReady: Boolean(prepared.cvPdfPath),
    cvDocxReady: true,
    coverLetterReady: true,
  });
}
