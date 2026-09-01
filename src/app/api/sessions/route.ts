import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const MAX_ACTIVE_SESSIONS = 3;

/**
 * GET /api/sessions
 * Lista dei round dell'utente con progresso (sentCount / targetCount).
 *
 * Logica anti-accumulo:
 *  1. Auto-archive: sessioni active con 0 candidature aperte >30gg → cancelled.
 *  2. Auto-archive: sessioni completed >14gg dopo completedAt → cancelled.
 *  3. Filtro: la lista mostra solo attive/paused + completed-non-ancora-viste.
 *     Le altre finiscono in `archivedCount` (l'UI dice "N round archiviati").
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ sessions: [] });
  }

  const now = Date.now();
  const staleActiveCutoff = new Date(now - 30 * 86_400_000);
  const oldCompletedCutoff = new Date(now - 14 * 86_400_000);

  // Cleanup silenzioso, best-effort — non blocca la response se fallisce.
  await prisma.applicationSession
    .updateMany({
      where: {
        userId: user.id,
        status: { in: ["active", "auto"] },
        applications: { none: {} },
        createdAt: { lt: staleActiveCutoff },
      },
      data: { status: "cancelled" },
    })
    .catch(() => void 0);
  await prisma.applicationSession
    .updateMany({
      where: {
        userId: user.id,
        status: "completed",
        completedAt: { lt: oldCompletedCutoff },
      },
      data: { status: "cancelled" },
    })
    .catch(() => void 0);
  // Idle: sessioni active/auto senza aggiornamenti da >14gg (updatedAt
  // si rinfresca su ogni resolveSession → apply). Copre le sessioni
  // legacy granulari accumulate prima del refactor a chiave "category".
  await prisma.applicationSession
    .updateMany({
      where: {
        userId: user.id,
        status: { in: ["active", "auto"] },
        updatedAt: { lt: oldCompletedCutoff },
      },
      data: { status: "cancelled" },
    })
    .catch(() => void 0);

  const sessions = await prisma.applicationSession.findMany({
    where: {
      userId: user.id,
      OR: [
        { status: { in: ["active", "auto", "paused"] } },
        { status: "completed", completedAcknowledgedAt: null },
      ],
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 20,
    include: {
      _count: { select: { applications: true } },
    },
  });

  const archivedCount = await prisma.applicationSession.count({
    where: { userId: user.id, status: "cancelled" },
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
    archivedCount,
    sessions: sessions.map((s) => ({
      id: s.id,
      label: s.label,
      title: s.title ?? s.label,
      status: normalizeStatus(s.status),
      targetCount: s.targetCount,
      sentCount: s.sentCount,
      customContext: s.customContext,
      totalApplications: s._count.applications,
      awaitingConsent: awaitingMap.get(s.id) ?? 0,
      createdAt: s.createdAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
      completedAcknowledgedAt: s.completedAcknowledgedAt?.toISOString() ?? null,
    })),
  });
}

/**
 * POST /api/sessions
 * Crea un nuovo round. Body:
 *   { title: string, targetCount?: number, customContext?: string }
 *
 * Vincoli: massimo MAX_ACTIVE_SESSIONS round attivi (status=active|paused)
 * per utente.
 */
const CreateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  targetCount: z.number().int().min(1).max(200).optional(),
  customContext: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { title, targetCount = 30, customContext } = parsed.data;

  const activeCount = await prisma.applicationSession.count({
    where: {
      userId: user.id,
      status: { in: ["active", "auto", "paused"] },
    },
  });
  if (activeCount >= MAX_ACTIVE_SESSIONS) {
    return NextResponse.json(
      {
        error: "too_many_sessions",
        message: `Massimo ${MAX_ACTIVE_SESSIONS} round in parallelo. Completa o annulla uno dei round attivi prima di iniziarne un altro.`,
      },
      { status: 400 },
    );
  }

  const key = `round::${title.toLowerCase().replace(/\s+/g, "-")}::${Date.now()}`;
  const created = await prisma.applicationSession.create({
    data: {
      userId: user.id,
      key,
      label: `Round ${title}`,
      title,
      targetCount,
      sentCount: 0,
      customContext: customContext ?? null,
      status: "active",
    },
  });

  return NextResponse.json({
    ok: true,
    session: {
      id: created.id,
      title: created.title,
      label: created.label,
      targetCount: created.targetCount,
      sentCount: 0,
      status: "active",
      customContext: created.customContext,
    },
  });
}

function normalizeStatus(s: string): string {
  if (s === "auto") return "active";
  return s;
}
