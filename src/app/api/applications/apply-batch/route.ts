import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { getLimits, normalizeTier } from "@/lib/billing";
import { applyLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  jobIds: z.array(z.string().min(1)).min(1).max(100),
});

function portalOf(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("linkedin")) return "linkedin";
  if (u.includes("indeed")) return "indeed";
  if (u.includes("infojobs")) return "infojobs";
  return "other";
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Devi loggarti." },
        { status: 401 },
      );
    }

    // Rate limit globale (conta una sola chiamata, il limite reale è monthly)
    const rl = await applyLimiter.limit(`user:${user.id}:batch`);
    if (!rl.success) {
      return NextResponse.json(
        {
          error: "rate_limit",
          message: "Troppe candidature. Riprova tra qualche minuto.",
          reset: rl.reset,
        },
        { status: 429 },
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { jobIds } = parsed.data;

    // --- CV check ---
    const cv = await prisma.cVDocument.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!cv) {
      return NextResponse.json(
        { error: "missing_cv", message: "Carica prima il tuo CV." },
        { status: 409 },
      );
    }

    // --- Paywall per-tier ---
    const tier = normalizeTier(user.tier);
    const limits = getLimits(tier);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const usedThisMonth = await prisma.application.count({
      where: { userId: user.id, createdAt: { gte: monthStart } },
    });
    const remainingQuota =
      limits.monthlyApplications === Infinity
        ? Infinity
        : Math.max(0, limits.monthlyApplications - usedThisMonth);

    if (remainingQuota === 0) {
      return NextResponse.json(
        {
          error: "paywall",
          message:
            tier === "free"
              ? "Hai esaurito le 3 candidature del piano Free di questo mese."
              : `Hai esaurito il limite mensile del piano ${tier}.`,
          tier,
        },
        { status: 402 },
      );
    }

    // Fetch jobs and dedupe against already-applied
    const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } } });
    const already = await prisma.application.findMany({
      where: { userId: user.id, jobId: { in: jobIds } },
      select: { jobId: true },
    });
    const alreadySet = new Set(already.map((a) => a.jobId));
    const toApply = jobs.filter((j) => !alreadySet.has(j.id));

    const capped =
      remainingQuota === Infinity ? toApply : toApply.slice(0, remainingQuota);

    let enqueued = 0;
    const errors: Array<{ jobId: string; error: string }> = [];

    for (const job of capped) {
      try {
        const portal = portalOf(job.url);
        const application = await prisma.application.create({
          data: { userId: user.id, jobId: job.id, portal, status: "queued" },
        });
        await enqueueApplication(application.id);
        enqueued++;
      } catch (err) {
        errors.push({
          jobId: job.id,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      enqueued,
      skipped: jobs.length - capped.length,
      alreadyApplied: alreadySet.size,
      errors,
      remaining:
        remainingQuota === Infinity
          ? null
          : Math.max(0, remainingQuota - enqueued),
    });
  } catch (err) {
    console.error("[api/applications/apply-batch]", err);
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "Errore" },
      { status: 500 },
    );
  }
}
