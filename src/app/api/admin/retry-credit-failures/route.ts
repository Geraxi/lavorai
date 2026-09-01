import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueApplication, cancelApplication } from "@/lib/application-queue";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Ri-accoda le candidature fallite per "credit balance" (crediti AI
 * esauriti). Quando i crediti erano finiti il worker marcava failed; ora
 * che ci sono di nuovo, le rimettiamo in coda.
 *
 * Auth: header X-Admin-Key == ADMIN_SYNC_KEY (script) OPPURE sessione
 * admin loggata (bottone founder).
 *
 * Body opzionale: { days?: number, limit?: number }
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const headerKey = req.headers.get("x-admin-key");
  const expected = process.env.ADMIN_SYNC_KEY;
  if (expected && headerKey === expected) return true;
  const user = await getCurrentUser();
  return isAdmin(user?.email);
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Math.min(30, Number(body?.days) || 14));
  const limit = Math.max(1, Math.min(200, Number(body?.limit) || 100));
  const since = new Date(Date.now() - days * 86_400_000);

  const failed = await prisma.application.findMany({
    where: {
      status: "failed",
      OR: [
        { errorMessage: { contains: "credit balance", mode: "insensitive" } },
        { errorMessage: { contains: "crediti esauriti", mode: "insensitive" } },
        { errorMessage: { contains: "insufficient", mode: "insensitive" } },
      ],
      createdAt: { gte: since },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let requeued = 0;
  for (const app of failed) {
    try {
      // Rimuovi l'eventuale job BullMQ vecchio (stesso jobId) così il
      // re-enqueue non viene deduplicato e silenziosamente ignorato.
      await cancelApplication(app.id);
      await prisma.application.update({
        where: { id: app.id },
        data: { status: "queued", startedAt: null, errorMessage: null },
      });
      await enqueueApplication(app.id);
      requeued++;
    } catch (err) {
      console.error(`[retry-credit-failures] ${app.id} failed`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    found: failed.length,
    requeued,
    days,
  });
}
