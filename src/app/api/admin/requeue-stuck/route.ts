import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueApplication } from "@/lib/application-queue";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Admin: ri-accoda su BullMQ tutte le candidature ferme in
 * status=queued / optimizing / applying con startedAt più vecchio di N
 * minuti (default 30). Risolve il caso Redis-out-of-quota in cui le DB
 * rows restano orfane senza l'entry Redis corrispondente.
 *
 *   curl -X POST "https://lavorai.it/api/admin/requeue-stuck?minutes=30" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const minutes = Math.max(
    1,
    Math.min(1440, parseInt(url.searchParams.get("minutes") ?? "30", 10)),
  );
  const cutoff = new Date(Date.now() - minutes * 60_000);

  const stuck = await prisma.application.findMany({
    where: {
      status: { in: ["queued", "optimizing", "applying"] },
      OR: [
        { startedAt: { lt: cutoff } },
        { startedAt: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // Reset status a "queued" (al successivo dequeue il worker imposta optimizing)
  // e startedAt a null così il monitoring conta da capo.
  let requeued = 0;
  for (const app of stuck) {
    try {
      await prisma.application.update({
        where: { id: app.id },
        data: { status: "queued", startedAt: null, errorMessage: null },
      });
      await enqueueApplication(app.id);
      requeued++;
    } catch (err) {
      console.error(`[requeue-stuck] ${app.id} failed`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    found: stuck.length,
    requeued,
    cutoffMinutes: minutes,
  });
}
