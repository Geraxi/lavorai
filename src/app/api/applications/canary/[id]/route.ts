import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/applications/canary/[id]
 *
 * Restituisce il canary log forense per una specifica Application:
 *   - resumeAttachedFilename: il CV è davvero attaccato? (null = NO)
 *   - preSubmitScreenshotUrl: stato visivo del form prima del click
 *   - postSubmitScreenshotUrl: stato dopo il click
 *   - fields: tutti i campi del form e se sono compilati
 *   - submitHttpStatus + submitHttpBody: response HTTP del server
 *   - urlBeforeSubmit / urlAfterSubmit / bodyTextAfterSubmit
 *
 * Popolato solo quando env CANARY_DEBUG=1 era attivo al momento del
 * submit. Per le candidature pre-instrumentation o run normali è null.
 *
 * Auth: solo proprietario.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const { id } = await params;

  const app = await prisma.application.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      status: true,
      submittedVia: true,
      submitConfirmation: true,
      errorMessage: true,
      canaryLog: true,
      createdAt: true,
      completedAt: true,
      job: { select: { title: true, company: true, url: true } },
    },
  });
  if (!app) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let canary: Record<string, unknown> | null = null;
  if (app.canaryLog) {
    try {
      canary = JSON.parse(app.canaryLog);
    } catch {
      /* malformato */
    }
  }

  // Verdetto sintetico per l'utente
  let verdict = "";
  if (!canary) {
    verdict =
      "Nessun canary log per questa candidatura. Attiva CANARY_DEBUG=1 in Vercel env e fai partire una nuova candidatura per raccogliere evidence.";
  } else {
    const resumeOk = canary.resumeAttachedFilename != null;
    const httpStatus = canary.submitHttpStatus as number | null;
    if (!resumeOk) {
      verdict =
        "🚨 CV NON attaccato al form prima del submit. La submission è partita SENZA il CV → spiega l'assenza di mail di conferma. Root cause confermato.";
    } else if (httpStatus && httpStatus >= 200 && httpStatus < 300) {
      verdict = `✅ CV attaccato (${canary.resumeAttachedFilename}) e server ha risposto HTTP ${httpStatus}. La submission è probabilmente arrivata davvero. Se manca la mail di conferma, è problema della company specifica (alcune ATS non mandano ack automatico).`;
    } else if (httpStatus && httpStatus >= 400) {
      verdict = `⚠️ CV attaccato ma il server ha risposto HTTP ${httpStatus}. La submission è stata RIFIUTATA. Response body: "${canary.submitHttpBody}".`;
    } else {
      verdict =
        "⚠️ Submit cliccato ma nessuna POST HTTP catturata. Validazione client-side probabilmente bloccava il submit. Vedi screenshot post-submit per banner errore.";
    }
  }

  return NextResponse.json({
    application: {
      id: app.id,
      job: `${app.job.title} @ ${app.job.company ?? "?"}`,
      url: app.job.url,
      status: app.status,
      submittedVia: app.submittedVia,
      submitConfirmation: app.submitConfirmation,
      errorMessage: app.errorMessage,
      createdAt: app.createdAt,
      completedAt: app.completedAt,
    },
    canary,
    verdict,
  });
}
