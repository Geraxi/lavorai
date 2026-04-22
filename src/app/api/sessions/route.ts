import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/sessions
 * Lista delle sessioni di candidatura dell'utente con contatori.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ sessions: [] });
  }

  const sessions = await prisma.applicationSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { applications: true } },
    },
  });

  // Conteggia quante awaiting_consent per sessione
  const awaitingByS = await prisma.application.groupBy({
    by: ["sessionId"],
    where: {
      userId: user.id,
      status: "awaiting_consent",
      sessionId: { not: null },
    },
    _count: true,
  });
  const awaitingMap = new Map<string, number>();
  for (const row of awaitingByS) {
    if (row.sessionId) awaitingMap.set(row.sessionId, row._count);
  }

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      label: s.label,
      key: s.key,
      status: s.status, // "auto" | "paused"
      total: s._count.applications,
      awaitingConsent: awaitingMap.get(s.id) ?? 0,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
}
