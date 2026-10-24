import { historicalRetriesBlocked } from "@/lib/application-rollout";
import { applicationsPaused } from "@/lib/application-pause";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { blocksUncertainAutoRetry, UNCERTAIN_SUBMISSION_MESSAGE } from "@/lib/uncertain-submission";

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
  if (applicationsPaused()) return NextResponse.json({ error: "applications_paused" }, { status: 503 });
  if (historicalRetriesBlocked()) return NextResponse.json({ error: "historical_application_retries_blocked" }, { status: 503 });
  const url = new URL(req.url);
  const minutes = Math.max(
    1,
    Math.min(1440, parseInt(url.searchParams.get("minutes") ?? "10", 10)),
  );
  const cutoff = new Date(Date.now() - minutes * 60_000);

  const stuck = await prisma.application.findMany({
    where: {
      status: "applying",
      startedAt: { lt: cutoff },
      completedAt: null,
    },
    select: {
      id: true, startedAt: true, submitStartedAt: true, submittedAt: true,
      submittedVia: true, submitConfirmation: true, canaryLog: true,
      answersUsedJson: true, viewedAt: true, lastReplyAt: true, replyCount: true, userStatus: true,
    },
    take: 200,
  });

  let updated = 0;
  let uncertain = 0;
  const now = new Date();
  for (const app of stuck) {
    if (blocksUncertainAutoRetry(app)) {
      const changed = await prisma.application.updateMany({
        where: { id: app.id, status: "applying", startedAt: app.startedAt, completedAt: null },
        data: {
          status: "ready_to_apply",
          submitConfirmation: "UNCONFIRMED",
          completedAt: now,
          errorMessage: UNCERTAIN_SUBMISSION_MESSAGE,
        },
      });
      updated += changed.count;
      uncertain += changed.count;
      continue;
    }
    const changed = await prisma.application.updateMany({
      where: { id: app.id, status: "applying", startedAt: app.startedAt, completedAt: null },
      data: { status: "ready_to_apply", completedAt: now },
    });
    updated += changed.count;
  }

  return NextResponse.json({
    ok: true,
    updated,
    uncertain,
    cutoffMinutes: minutes,
  });
}
