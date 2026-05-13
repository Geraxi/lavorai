import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { guardPremiumAPI } from "@/lib/premium-gate";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/interview/prep
 *
 * Salva il brief di preparazione colloquio per una specifica
 * Application. Crea o aggiorna la InterviewSession associata.
 *
 * Body:
 *   {
 *     applicationId: string,
 *     goal: "offer" | "explore" | "challenge" | "negotiate",
 *     expectedRound: "hr" | "technical" | "behavioral" | "final",
 *     stressLevel: 1-5,
 *     weakAreas: string[],
 *     strengths: string[],
 *     customNotes?: string
 *   }
 *
 * Ritorna: { sessionId, pairingCode }
 */
export async function POST(request: NextRequest) {
  const gate = await guardPremiumAPI("interview_copilot");
  if (gate.error) return gate.error;
  const user = gate.user;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
  if (!applicationId) {
    return NextResponse.json({ error: "missing_application_id" }, { status: 400 });
  }

  // Verifica ownership della Application
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    select: { id: true },
  });
  if (!app) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const brief = {
    goal: typeof body.goal === "string" ? body.goal : "offer",
    expectedRound: typeof body.expectedRound === "string" ? body.expectedRound : "hr",
    stressLevel: typeof body.stressLevel === "number" ? body.stressLevel : 3,
    weakAreas: Array.isArray(body.weakAreas)
      ? body.weakAreas.filter((x): x is string => typeof x === "string")
      : [],
    strengths: Array.isArray(body.strengths)
      ? body.strengths.filter((x): x is string => typeof x === "string")
      : [],
    customNotes: typeof body.customNotes === "string" ? body.customNotes : "",
    generatedAt: new Date().toISOString(),
  };

  // Pairing code: 8 char alfanumerico, riusabile per la Chrome extension.
  // TTL 24h dal momento del setup brief, esteso quando si avvia la live.
  const pairingCode = randomBytes(4).toString("hex").toUpperCase();
  const pairingExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Upsert by applicationId (1:1 oggi)
  const existing = await prisma.interviewSession.findFirst({
    where: { applicationId, userId: user.id },
  });

  const session = existing
    ? await prisma.interviewSession.update({
        where: { id: existing.id },
        data: {
          briefJson: JSON.stringify(brief),
          pairingCode,
          pairingCodeExpiresAt: pairingExpiresAt,
        },
      })
    : await prisma.interviewSession.create({
        data: {
          applicationId,
          userId: user.id,
          briefJson: JSON.stringify(brief),
          pairingCode,
          pairingCodeExpiresAt: pairingExpiresAt,
        },
      });

  return NextResponse.json({
    ok: true,
    sessionId: session.id,
    pairingCode,
    pairingExpiresAt,
  });
}
