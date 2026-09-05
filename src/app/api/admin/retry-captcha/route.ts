import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueApplication, cancelApplication } from "@/lib/application-queue";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { findPortalAdapter } from "@/lib/portal-adapters";

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
  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Math.min(60, Number(body?.days) || 30));
  const limit = Math.max(1, Math.min(300, Number(body?.limit) || 200));
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await prisma.application.findMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { status: "ready_to_apply", submitConfirmation: "CAPTCHA" },
        { status: "failed", errorMessage: { contains: "non confermato", mode: "insensitive" } },
        { status: "failed", errorMessage: { contains: "captcha", mode: "insensitive" } },
      ],
    },
    select: { id: true, job: { select: { url: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const targets = rows.filter((r) => findPortalAdapter(r.job.url));
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
