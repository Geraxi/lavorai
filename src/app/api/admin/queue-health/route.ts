import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { findPortalAdapter } from "@/lib/portal-adapters";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/admin/queue-health
 * Fotografia della configurazione REALE con cui gira la pipeline su Vercel:
 * quale percorso usa enqueueApplication (BullMQ→Railway o self-invoke su
 * Vercel), se Redis risponde, quanti job in coda, e i flag che decidono se
 * gli adapter ATS partono (PORTAL_SUBMIT_ENABLED / DRY_RUN). Admin-only.
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const headerKey = req.headers.get("x-admin-key");
  const expected = process.env.ADMIN_SYNC_KEY;
  if (expected && headerKey === expected) return true;
  const user = await getCurrentUser();
  return isAdmin(user?.email);
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const env = {
    REDIS_URL: !!process.env.REDIS_URL,
    PORTAL_SUBMIT_ENABLED: process.env.PORTAL_SUBMIT_ENABLED ?? null,
    PORTAL_SUBMIT_DRY_RUN: process.env.PORTAL_SUBMIT_DRY_RUN ?? null,
    AUTO_APPLY_ENABLED: process.env.AUTO_APPLY_ENABLED ?? null,
    CRON_SECRET: !!process.env.CRON_SECRET,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
  };

  // Percorso di enqueue che verrebbe usato ORA (stessa logica di application-queue.ts).
  const enqueuePath = process.env.REDIS_URL
    ? "bullmq→worker Railway"
    : process.env.INNGEST_EVENT_KEY
      ? "inngest"
      : process.env.QSTASH_TOKEN && process.env.NEXT_PUBLIC_SITE_URL
        ? "qstash"
        : env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
          ? "self-invoke su Vercel (/api/applications/process)"
          : "in-process (pericoloso in prod)";

  // Redis / BullMQ (con timeout: non deve bloccare la pagina).
  let redis: { ping: string | null; waiting?: number; active?: number; delayed?: number; failed?: number; completed?: number; error?: string } = { ping: null };
  if (process.env.REDIS_URL) {
    try {
      const { getApplicationsQueue } = await import("@/lib/bullmq-queue");
      const q = getApplicationsQueue();
      const withTimeout = <T,>(p: Promise<T>, ms: number) =>
        Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms))]);
      const client = await withTimeout(q.client, 5000);
      const ping = await withTimeout(client.ping(), 5000);
      const counts = await withTimeout(q.getJobCounts("waiting", "active", "delayed", "failed", "completed"), 5000);
      redis = { ping, ...counts };
    } catch (err) {
      redis = { ping: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Stato pipeline dal DB (ultime 24h) + quante candidature aperte hanno un adapter ATS.
  const since = new Date(Date.now() - 24 * 3600_000);
  const [byStatus24h, lastProcessed, openWithUrl] = await Promise.all([
    prisma.application.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.application.findFirst({ where: { completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { completedAt: true, status: true, portal: true, submitConfirmation: true } }),
    prisma.application.findMany({ where: { status: { in: ["queued", "ready_to_apply", "failed"] } }, select: { job: { select: { url: true } } }, take: 500 }),
  ]);
  const openWithAdapter = openWithUrl.filter((a) => findPortalAdapter(a.job.url)).length;

  return NextResponse.json({
    now: new Date().toISOString(),
    enqueuePath,
    env,
    redis,
    pipeline24h: Object.fromEntries(byStatus24h.map((r) => [r.status, r._count._all])),
    lastProcessed,
    openApplications: openWithUrl.length,
    openWithAtsAdapter: openWithAdapter,
    verdict: [
      env.PORTAL_SUBMIT_ENABLED !== "true" ? "PORTAL_SUBMIT_ENABLED non è 'true' su Vercel: se le candidature vengono processate qui (self-invoke), gli adapter ATS non partono mai." : null,
      env.PORTAL_SUBMIT_DRY_RUN === "true" ? "PORTAL_SUBMIT_DRY_RUN=true su Vercel: i form vengono compilati ma non inviati." : null,
      !env.REDIS_URL ? "REDIS_URL assente su Vercel: la coda NON va al worker Railway, tutto gira in serverless su Vercel." : null,
      env.REDIS_URL && redis.error ? `REDIS_URL presente ma Redis non risponde (${redis.error}): enqueue fallisce e ripiega su self-invoke.` : null,
      !env.CRON_SECRET ? "CRON_SECRET assente: i cron Vercel (auto-apply/sync-jobs/nudges) rispondono 401." : null,
    ].filter(Boolean),
  });
}
