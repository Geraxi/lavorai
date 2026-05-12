import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/applications/diagnostic?q=<text>&url=<jobUrl>
 *
 * Endpoint diagnostico per verificare lo stato reale di una candidatura.
 * Pensato per rispondere a "ma davvero hai mandato la candidatura su
 * <azienda>?" — espone TUTTI i campi rilevanti del record Application:
 *
 *   - status              : success | ready_to_apply | failed | ...
 *   - submittedVia        : "portal_greenhouse" / "email_recruiter" / null
 *   - submitConfirmation  : "DETECTED" | "UNCONFIRMED" | "DRY_RUN" | null
 *                           (null = pre-instrumentation, non possiamo dire)
 *   - errorMessage        : motivo human-readable se non success
 *   - completedAt         : timestamp di chiusura del worker
 *   - startedAt / createdAt
 *   - job.title / company / url
 *
 * Filtri:
 *   - q=<text>   matcha company OR title (insensitive)
 *   - url=<text> matcha url esatto/prefisso
 *
 * Limita a 20 risultati. Solo proprietario può vedere le proprie.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";

  if (!q && !url) {
    return NextResponse.json(
      { error: "missing_filter", message: "Specifica ?q=<text> o ?url=<jobUrl>" },
      { status: 400 },
    );
  }

  const jobWhere: Record<string, unknown> = {};
  if (q) {
    jobWhere.OR = [
      { company: { contains: q, mode: "insensitive" as const } },
      { title: { contains: q, mode: "insensitive" as const } },
    ];
  }
  if (url) {
    jobWhere.url = { contains: url };
  }

  const apps = await prisma.application.findMany({
    where: {
      userId: user.id,
      job: jobWhere,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      submittedVia: true,
      submitConfirmation: true,
      errorMessage: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      portal: true,
      userStatus: true,
      viewedAt: true,
      job: {
        select: {
          title: true,
          company: true,
          url: true,
          source: true,
        },
      },
    },
  });

  // Interpretation helper: spiega in italiano cosa significa ogni record
  const annotated = apps.map((a) => ({
    ...a,
    interpretation: explain(a),
  }));

  return NextResponse.json({
    count: apps.length,
    note:
      "submitConfirmation null = candidatura processata PRIMA del fix " +
      "false-success. Non possiamo sapere retroattivamente se la submission " +
      "è stata accettata davvero — usa il campo `submittedVia` e verifica " +
      "manualmente sul portale.",
    applications: annotated,
  });
}

function explain(a: {
  status: string;
  submittedVia: string | null;
  submitConfirmation: string | null;
  errorMessage: string | null;
}): string {
  if (a.status === "success") {
    if (a.submitConfirmation === "DETECTED") {
      return "Submit confermato dall'adapter: thank-you page o URL di conferma rilevati. Alta confidenza che sia arrivata.";
    }
    if (a.submitConfirmation === "UNCONFIRMED") {
      return "⚠️ Marcata success ma adapter NON ha rilevato conferma chiara. Verificare manualmente sul portale.";
    }
    if (a.submitConfirmation === null) {
      if (a.submittedVia?.startsWith("portal_")) {
        return "⚠️ Candidatura PRE-fix false-success: marcata success dal portal adapter, ma non possiamo dire se la conferma era stata rilevata davvero. Verificare a mano.";
      }
      if (a.submittedVia === "email_recruiter") {
        return "Inviata via email al recruiter (non submit ATS). Confermata dalla consegna SMTP.";
      }
      return "Marcata success ma submittedVia null — anomalo, indagare.";
    }
    return `Submit ${a.submitConfirmation ?? "??"}.`;
  }
  if (a.status === "ready_to_apply") {
    return a.errorMessage ?? "Form compilato ma submit non eseguito.";
  }
  if (a.status === "failed") {
    return a.errorMessage ?? "Workflow fallito.";
  }
  return `Stato pipeline: ${a.status}`;
}
