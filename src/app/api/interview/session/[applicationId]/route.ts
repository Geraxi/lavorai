import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/interview/session/[applicationId]
 *
 * Restituisce la InterviewSession associata a una Application (se esiste).
 * Usata dalla pagina /interview/live per recuperare pairingCode + brief
 * senza riscriverlo (la pagina di prep gestisce le scritture).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const { applicationId } = await params;

  const session = await prisma.interviewSession.findFirst({
    where: { applicationId, userId: user.id },
    select: {
      id: true,
      briefJson: true,
      pairingCode: true,
      pairingCodeExpiresAt: true,
      startedAt: true,
      createdAt: true,
    },
  });

  if (!session) {
    return NextResponse.json({ session: null });
  }

  let brief: Record<string, unknown> | null = null;
  if (session.briefJson) {
    try {
      brief = JSON.parse(session.briefJson);
    } catch {
      /* noop */
    }
  }

  return NextResponse.json({
    session: {
      id: session.id,
      brief,
      pairingCode: session.pairingCode,
      pairingCodeExpiresAt: session.pairingCodeExpiresAt,
      startedAt: session.startedAt,
      createdAt: session.createdAt,
    },
  });
}
