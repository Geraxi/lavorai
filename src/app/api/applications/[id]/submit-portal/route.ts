import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { processApplication } from "@/lib/application-worker";
import { isSkippedPortalUrl, portalFamily } from "@/lib/ats-skip-hosts";
import { explicitPortalSubmissionRequestJson } from "@/lib/application-material-preparation";
import { applicationsPaused } from "@/lib/application-pause";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Confirm one already-prepared Ashby application for browser-worker delivery.
 * This endpoint is only reached from the owner's explicit confirmation in the
 * application drawer. It never bypasses CAPTCHA or fabricates required answers.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (applicationsPaused()) {
    return NextResponse.json({
      error: "applications_paused",
      message: "Gli invii automatici sono momentaneamente in pausa: nessuna candidatura è stata inviata.",
    }, { status: 503 });
  }

  const { id } = await params;
  const app = await prisma.application.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      cvDocxPath: true,
      coverLetterPath: true,
      submittedAt: true,
      submittedVia: true,
      submitStartedAt: true,
      submitClickPerformedAt: true,
      outboundSubmissionJson: true,
      submissionReceiptJson: true,
      job: { select: { url: true } },
    },
  });
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // This narrowly enables the adapter that was intentionally held because it
  // may surface a CAPTCHA. Other manual hosts retain their existing flow.
  if (!isSkippedPortalUrl(app.job.url) || portalFamily(app.job.url) !== "ashby") {
    return NextResponse.json({ error: "unsupported_portal", message: "L'invio automatico non è disponibile per questo portale." }, { status: 409 });
  }
  if (!app.cvDocxPath || !app.coverLetterPath) {
    return NextResponse.json({ error: "materials_missing", message: "Prepara prima CV e lettera per questa candidatura." }, { status: 409 });
  }
  if (app.submittedAt || app.submittedVia || app.submitStartedAt || app.submitClickPerformedAt || app.outboundSubmissionJson || app.submissionReceiptJson) {
    return NextResponse.json({ error: "submission_state_uncertain", message: "Questa candidatura ha già un tentativo di invio da verificare." }, { status: 409 });
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
      suggestionsJson: explicitPortalSubmissionRequestJson(),
      errorMessage: null,
      completedAt: null,
      startedAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
  if (updated.count !== 1) return NextResponse.json({ error: "state_changed" }, { status: 409 });

  // This is a narrowly scoped, explicitly confirmed send. Run it in this
  // Vercel function so it does not depend on a separate Railway poller or an
  // internal HTTP self-invocation. `processApplication` retains all normal
  // liveness, answer, CAPTCHA, and hard-receipt gates.
  await processApplication(app.id);
  const result = await prisma.application.findUnique({
    where: { id: app.id },
    select: { status: true, errorMessage: true, submittedAt: true, submittedVia: true },
  });
  return NextResponse.json({
    ok: true,
    status: result?.status ?? "queued",
    submitted: Boolean(result?.submittedAt && result?.submittedVia),
    message: result?.errorMessage ?? null,
  });
}
