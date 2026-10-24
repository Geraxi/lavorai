import { rolloutCreationBlocked } from "@/lib/application-rollout";
import { applicationsPaused } from "@/lib/application-pause";
import { applicationPrerequisiteBlock } from "@/lib/application-prerequisites";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { monthlyQuotaSince } from "@/lib/admin-user-actions";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { dailyApplicationLimit, getLimits, effectiveTier, requiresPaymentMethodBeforeApp } from "@/lib/billing";
import { countDailyCapUsage } from "@/lib/daily-application-cap";
import { applyLimiter } from "@/lib/rate-limit";
import { quickMatchScore } from "@/lib/match-score";
import { rowToProfile } from "@/lib/cv-profile-types";
import { resolveSession } from "@/lib/apply-session";
import { recordConversionEvent } from "@/lib/conversion-events";
import { AnalyticsEvent } from "@/lib/analytics";
import { ACTIVATION_MESSAGES, getActivationReadiness } from "@/lib/activation-readiness";
import { isAtsTestJobSource } from "@/lib/ats-test-capability";

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

    if (applicationsPaused()) {
      return NextResponse.json({ error: "applications_paused", message: "Invii temporaneamente in pausa per manutenzione." }, { status: 503 });
    }

    if (rolloutCreationBlocked()) {
      return NextResponse.json({ error: "application_rollout_closed", message: "Invii temporaneamente sospesi." }, { status: 503 });
    }

    const prerequisite = applicationPrerequisiteBlock(user);
    if (prerequisite) return NextResponse.json(prerequisite.body, { status: prerequisite.status });

    if (requiresPaymentMethodBeforeApp(user)) {
      return NextResponse.json(
        { error: "payment_method_required", message: "Completa l'attivazione del pagamento per iniziare a candidarti.", redirect: "/start-membership" },
        { status: 402 },
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

    const readiness = await getActivationReadiness(user.id);
    if (!readiness.ready) {
      return NextResponse.json(
        { error: "activation_incomplete", issue: readiness.issue, message: ACTIVATION_MESSAGES[readiness.issue!] },
        { status: 409 },
      );
    }

    // --- Paywall per-tier enforcement ---
    const tier = effectiveTier(user);
    const limits = getLimits(tier);

    // --- Parallel batch reads (era 6+ query sequenziali → 700-1500ms
    // di round-trip Neon. Ora tutto in 1 sola tornata) ---
    // Public ATS forms and recruiter email do not require a connected account.
    // The worker checks sessions only when the selected portal needs one.
    const [usedThisMonth, usedToday, cv, job, prefs, profileRow, previousApplication] =
      await Promise.all([
        prisma.application.count({
          where: { userId: user.id, createdAt: { gte: monthlyQuotaSince((user as { quotaResetAt?: Date | null }).quotaResetAt ?? null) }, status: { notIn: ["failed", "diagnostic"] } },
        }),
        countDailyCapUsage(prisma, user.id),
        prisma.cVDocument.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.job.findUnique({ where: { id: jobId } }),
        prisma.userPreferences.findUnique({
          where: { userId: user.id },
          select: { autoApplyMode: true, matchMin: true, dailyCap: true },
        }),
        prisma.cVProfile.findUnique({ where: { userId: user.id } }),
        prisma.application.findFirst({ where: { userId: user.id, jobId }, select: { id: true } }),
      ]);

    if (previousApplication) {
      return NextResponse.json({ error: "prior_application_exists", message: "Esiste già una candidatura per questo annuncio. I tentativi precedenti restano sospesi." }, { status: 409 });
    }

    // --- Guardrail checks (dopo il batch, sfrutta gli stessi dati) ---
    if (usedThisMonth >= limits.monthlyApplications) {
      return NextResponse.json(
        {
          error: "paywall",
          message:
            tier === "free"
              ? `La prova è terminata. Scegli Pro per continuare a inviare candidature.`
              : `Hai esaurito il limite mensile del piano ${tier}. Passa a Pro+ per candidature illimitate.`,
          tier,
          used: usedThisMonth,
          limit: limits.monthlyApplications,
        },
        { status: 402 },
      );
    }
    const dailyLimit = dailyApplicationLimit(user, prefs?.dailyCap);
    if (usedToday >= dailyLimit) {
      return NextResponse.json(
        {
          error: dailyLimit === 0 ? "paywall" : "daily_limit",
          message:
            dailyLimit === 0
              ? "La prova è terminata: il tuo account è in pausa. Scegli Pro per continuare a inviare candidature."
              : `Hai raggiunto il limite di ${dailyLimit} candidature per oggi. Torna domani oppure passa a Pro per continuare senza la pausa della prova.`,
          limit: dailyLimit,
        },
        { status: dailyLimit === 0 ? 402 : 429 },
      );
    }
    if (!cv) {
      return NextResponse.json(
        { error: "missing_cv", message: "Carica prima il tuo CV." },
        { status: 409 },
      );
    }
    if (!job || isAtsTestJobSource(job.source)) {
      return NextResponse.json(
        { error: "job_not_found", message: "Annuncio non trovato." },
        { status: 404 },
      );
    }
    type Mode = "off" | "manual" | "hybrid" | "auto";
    const mode: Mode = (prefs?.autoApplyMode as Mode) ?? "manual";

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

    // --- Match score ---
    const matchMin = prefs?.matchMin ?? 0;
    let score = 100;
    if (profileRow) {
      const profile = rowToProfile(profileRow);
      score = quickMatchScore(
        profile,
        `${job.title}\n${job.company ?? ""}\n${job.description}`,
      );
    }
    // Modalità auto: match sotto soglia → blocca (non applica mai sotto soglia)
    if (mode === "auto" && matchMin > 0 && score < matchMin) {
      return NextResponse.json(
        {
          error: "below_match_threshold",
          message: `Match ${score}% sotto la soglia minima ${matchMin}%. Passa a modalità Ibrido o Manuale se vuoi applicare comunque, o abbassa la soglia.`,
          score,
          matchMin,
        },
        { status: 409 },
      );
    }

    // --- Resolve application session ---
    // Raggruppa candidature per categoria+ruolo. Se la sessione è "paused"
    // l'utente ha premuto Pausa → va sempre in awaiting_consent.
    const session = await resolveSession(user.id, {
      title: job.title,
      category: job.category,
    });

    // --- Crea la candidatura ---
    // Single-apply route: è un click ESPLICITO dell'utente su quel job
    // specifico. Trattiamo il click come consenso implicito; saltiamo
    // awaiting_consent anche in modalità hybrid/manual per evitare il
    // "consenti due volte" segnalato.
    // Eccezione: sessione in pausa → rispettiamo la pausa.
    const needsConsent = session.status === "paused";
    const initialStatus = needsConsent ? "awaiting_consent" : "queued";
    // Recheck immediately before creation, including each selected batch job.
    if (rolloutCreationBlocked()) return NextResponse.json({ error: "application_rollout_closed" }, { status: 503 });
    const createdAt = new Date();
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        jobId,
        portal,
        status: initialStatus,
        createdAt,
        consentGrantedAt: initialStatus === "queued" ? createdAt : null,
        trackingToken: randomToken(),
        atsScore: score, // pre-stima; il worker la sovrascrive con score AI
        sessionId: session.id,
      },
    });
    await recordConversionEvent(AnalyticsEvent.APPLICATION_CREATED, {
      userId: user.id,
      properties: { mode, consentRequired: needsConsent },
      dedupeKey: `application_created:${application.id}`,
    });

    if (!needsConsent) {
      await enqueueApplication(application.id, { preserveClaim: true });
    }

    return NextResponse.json({
      ok: true,
      applicationId: application.id,
      mode,
      status: initialStatus,
      score,
      matchMin,
      session: { id: session.id, label: session.label, status: session.status },
      remaining:
        dailyLimit - usedToday - 1,
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
