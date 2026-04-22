import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { getLimits, effectiveTier } from "@/lib/billing";
import { applyLimiter } from "@/lib/rate-limit";
import { quickMatchScore } from "@/lib/match-score";
import { rowToProfile } from "@/lib/cv-profile-types";

export const runtime = "nodejs";
export const maxDuration = 30;

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

    // --- Leggi preferenze (mode + matchMin) e profilo CV per match score ---
    const [prefs, profileRow] = await Promise.all([
      prisma.userPreferences.findUnique({
        where: { userId: user.id },
        select: { autoApplyMode: true, matchMin: true },
      }),
      prisma.cVProfile.findUnique({ where: { userId: user.id } }),
    ]);
    const mode: "off" | "hybrid" | "auto" =
      (prefs?.autoApplyMode as "off" | "hybrid" | "auto") ?? "hybrid";

    if (mode === "off") {
      return NextResponse.json(
        {
          error: "auto_apply_off",
          message:
            "L'auto-apply è disattivato. Vai in Preferenze per riattivarlo.",
        },
        { status: 409 },
      );
    }

    // --- Match score threshold ---
    const matchMin = prefs?.matchMin ?? 0;
    let score = 100;
    if (matchMin > 0 && profileRow) {
      const profile = rowToProfile(profileRow);
      score = quickMatchScore(
        profile,
        `${job.title}\n${job.company ?? ""}\n${job.description}`,
      );
      if (score < matchMin) {
        return NextResponse.json(
          {
            error: "below_match_threshold",
            message: `Match ${score}% sotto la soglia minima ${matchMin}%. Abbassa la soglia in Preferenze o scegli un altro annuncio.`,
            score,
            matchMin,
          },
          { status: 409 },
        );
      }
    }

    // --- Crea la candidatura ---
    // mode=auto → status queued, worker la pesca subito
    // mode=hybrid → status awaiting_consent, worker NON la pesca
    const initialStatus = mode === "hybrid" ? "awaiting_consent" : "queued";
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        jobId,
        portal,
        status: initialStatus,
        trackingToken: randomToken(),
        atsScore: score, // pre-stima; il worker la sovrascrive con score Claude
      },
    });

    if (mode === "auto") {
      await enqueueApplication(application.id);
    }

    return NextResponse.json({
      ok: true,
      applicationId: application.id,
      mode,
      status: initialStatus,
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
