import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Admin one-shot: transition applications bloccate in status=applying da
 * più di N minuti → ready_to_apply, così non intasano la lista candidature.
 *
 * Usage:
 *   curl -X POST "https://lavorai.it/api/admin/unstick-applying?minutes=10" \
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
    Math.min(1440, parseInt(url.searchParams.get("minutes") ?? "10", 10)),
  );
  const cutoff = new Date(Date.now() - minutes * 60_000);

  const res = await prisma.application.updateMany({
    where: {
      status: "applying",
      startedAt: { lt: cutoff },
      completedAt: null,
    },
    data: {
      status: "ready_to_apply",
      completedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    updated: res.count,
    cutoffMinutes: minutes,
  });
}
