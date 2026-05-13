import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/applications/manual
 *
 * Importa una candidatura inviata DALL'UTENTE manualmente (fuori da
 * LavorAI). Crea Job + Application records con:
 *   - Job.source = "manual" (escluso da scraping/auto-apply)
 *   - Application.submittedVia = "manual"
 *   - Application.status = "success" (è già inviata, è il punto)
 *   - Application.userStatus = stato logico (sent / interview / offer / rejected)
 *   - Application.submitConfirmation = "MANUAL" (label distinto)
 *
 * Body atteso (JSON):
 *   {
 *     company: string,
 *     title: string,
 *     jobUrl?: string,
 *     location?: string,
 *     description?: string,
 *     appliedAt?: string ISO date (default: now),
 *     userStatus?: "inviata" | "colloquio" | "offerta" | "rifiutata" (default: "inviata")
 *   }
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const company = typeof body.company === "string" ? body.company.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!company || !title) {
    return NextResponse.json(
      { error: "missing_required", message: "company e title sono obbligatori." },
      { status: 400 },
    );
  }

  const jobUrl = typeof body.jobUrl === "string" ? body.jobUrl.trim() : "";
  const location =
    typeof body.location === "string" ? body.location.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const userStatus =
    typeof body.userStatus === "string" ? body.userStatus.trim() : "inviata";
  const allowedStatuses = new Set([
    "inviata",
    "vista",
    "colloquio",
    "offerta",
    "rifiutata",
  ]);
  const finalUserStatus = allowedStatuses.has(userStatus)
    ? userStatus
    : "inviata";

  let appliedAt = new Date();
  if (typeof body.appliedAt === "string") {
    const d = new Date(body.appliedAt);
    if (!Number.isNaN(d.getTime())) appliedAt = d;
  }

  const externalId = `manual-${randomUUID()}`;

  // Crea Job + Application in transaction per consistenza.
  const result = await prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        externalId,
        source: "manual",
        title,
        company,
        location: location || null,
        description:
          description ||
          `Candidatura inserita manualmente per ${title} @ ${company}.`,
        url: jobUrl || `manual://${externalId}`,
        remote: false,
        postedAt: appliedAt,
      },
    });
    const application = await tx.application.create({
      data: {
        userId: user.id,
        jobId: job.id,
        portal: "manual",
        status: "success",
        submittedVia: "manual",
        submitConfirmation: "MANUAL",
        userStatus: finalUserStatus,
        createdAt: appliedAt,
        startedAt: appliedAt,
        completedAt: appliedAt,
      },
    });
    return { job, application };
  });

  return NextResponse.json({
    ok: true,
    applicationId: result.application.id,
    jobId: result.job.id,
  });
}
