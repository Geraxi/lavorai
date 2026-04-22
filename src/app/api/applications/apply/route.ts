import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { getLimits, effectiveTier } from "@/lib/billing";
import { applyLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  jobId: z.string().min(1),
  portal: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Devi loggarti per candidarti." },
        { status: 401 },
      );
    }

    // Rate limit globale anti-abuso
    const rl = await applyLimiter.limit(`user:${user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        {
          error: "rate_limit",
          message:
            "Troppe candidature in un'ora. Riprova tra qualche minuto.",
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
    const { jobId, portal } = parsed.data;

    // --- Paywall per-tier enforcement ---
    const tier = effectiveTier(user);
    const limits = getLimits(tier);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const usedThisMonth = await prisma.application.count({
      where: { userId: user.id, createdAt: { gte: monthStart } },
    });

    if (usedThisMonth >= limits.monthlyApplications) {
      return NextResponse.json(
        {
          error: "paywall",
          message:
            tier === "free"
              ? `Hai esaurito le 3 candidature del piano Free di questo mese.`
              : `Hai esaurito il limite mensile del piano ${tier}. Passa a Pro+ per candidature illimitate.`,
          tier,
          used: usedThisMonth,
          limit: limits.monthlyApplications,
        },
        { status: 402 },
      );
    }

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

    // --- Job check ---
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json(
        { error: "job_not_found", message: "Annuncio non trovato." },
        { status: 404 },
      );
    }

    // --- Portal session check (solo job reali) ---
    // Portal session serve solo per auto-submit (feature flagged).
    // Per MVP senza auto-apply, consegnamo CV+CL via email → nessuna
    // credenziale portale richiesta.
    if (process.env.AUTO_APPLY_ENABLED === "true" && job.source !== "mock") {
      const session = await prisma.portalSession.findUnique({
        where: { userId_portal: { userId: user.id, portal } },
      });
      if (!session) {
        return NextResponse.json(
          {
            error: "missing_session",
            message: `Collega prima il tuo account ${portal} per l'auto-apply.`,
            portal,
          },
          { status: 409 },
        );
      }
    }

    // --- Crea + enqueue ---
    const application = await prisma.application.create({
      data: { userId: user.id, jobId, portal, status: "queued" },
    });

    // Delega al queue abstraction: Inngest/QStash in prod, in-process in dev
    await enqueueApplication(application.id);

    return NextResponse.json({
      ok: true,
      applicationId: application.id,
      remaining:
        limits.monthlyApplications === Infinity
          ? null
          : limits.monthlyApplications - usedThisMonth - 1,
    });
  } catch (err) {
    console.error("[api/applications/apply]", err);
    return NextResponse.json(
      {
        error: "internal",
        message: err instanceof Error ? err.message : "Errore",
      },
      { status: 500 },
    );
  }
}
