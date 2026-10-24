import { historicalRetriesBlocked } from "@/lib/application-rollout";
import { applicationsPaused } from "@/lib/application-pause";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueApplication, cancelApplication } from "@/lib/application-queue";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { findPortalAdapter } from "@/lib/portal-adapters";
import { blocksUncertainAutoRetry } from "@/lib/uncertain-submission";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/retry-captcha
 * Ri-accoda le candidature ATS bloccate dal vecchio falso positivo captcha
 * (badge reCAPTCHA invisibile letto come captcha) e quelle marcate failed con
 * "Submit sul portale … non confermato". Solo job con adapter ATS.
 *
 * Body opzionale: { days?: number (1..60, default 30), limit?: number (1..300) }
 * Auth: sessione admin oppure header X-Admin-Key == ADMIN_SYNC_KEY.
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
  if (applicationsPaused()) return NextResponse.json({ error: "applications_paused" }, { status: 503 });
  if (historicalRetriesBlocked()) return NextResponse.json({ error: "historical_application_retries_blocked" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Math.min(60, Number(body?.days) || 30));
  const limit = Math.max(1, Math.min(300, Number(body?.limit) || 200));
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await prisma.application.findMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { status: "ready_to_apply", submitConfirmation: "CAPTCHA" },
        // Form compilato ma non inviato perché PORTAL_SUBMIT_DRY_RUN era attivo
        { submitConfirmation: "DRY_RUN", status: { notIn: ["success", "queued", "optimizing", "applying"] } },
        { status: "failed", errorMessage: { contains: "non confermato", mode: "insensitive" } },
        { status: "failed", errorMessage: { contains: "captcha", mode: "insensitive" } },
        // In attesa di risposte: da ora l'AI risponde da sola (o con default
        // conservativi) in ogni modalità, quindi si ritenta senza aspettare.
        { status: "needs_answers" },
      ],
    },
    select: {
      id: true, submitStartedAt: true, submittedAt: true, submittedVia: true,
      submitConfirmation: true, canaryLog: true, answersUsedJson: true,
      viewedAt: true, lastReplyAt: true, replyCount: true, userStatus: true,
      job: { select: { url: true } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const targets = rows.filter((r) => findPortalAdapter(r.job.url) && !blocksUncertainAutoRetry(r));
  let requeued = 0;
  for (const app of targets) {
    try {
      await cancelApplication(app.id);
      await prisma.application.update({
        where: { id: app.id },
        data: {
          status: "queued",
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          submitConfirmation: null,
          submittedVia: null,
          pendingQuestionsJson: null,
        },
      });
      await enqueueApplication(app.id);
      requeued++;
    } catch (err) {
      console.error(`[retry-captcha] ${app.id} failed`, err);
    }
  }

  return NextResponse.json({ ok: true, found: rows.length, withAdapter: targets.length, requeued, days });
}
