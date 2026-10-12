import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { optimizeCV } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ACTIVATION_MESSAGES, getActivationReadiness } from "@/lib/activation-readiness";
import { AnalyticsEvent } from "@/lib/analytics";
import { recordConversionEvent } from "@/lib/conversion-events";
import { isCardTrialCohort } from "@/lib/card-trial-policy";
import { assertCardTrialPreviewAccess, hasCardTrialPreviewWindow } from "@/lib/card-trial-store";
import { createPreviewStore, DefinitePreviewFailure, generateCardTrialOptimization, PreviewError, runCardTrialPreview } from "@/lib/card-trial-preview";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  targetRole: z.string().trim().min(2).max(100),
});

/**
 * Genera un'unica anteprima gratuita, senza creare Application o attivare
 * automazioni. Il job è selezionato dal catalogo quando possibile: così la
 * demo comunica valore su una posizione concreta invece di una promessa vaga.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  if (isCardTrialCohort(user)) return cardTrialPreview(request, user.id);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", message: "Scegli un ruolo per creare l'anteprima." }, { status: 400 });
  }

  const readiness = await getActivationReadiness(user.id);
  if (!readiness.ready) {
    return NextResponse.json(
      { error: "activation_incomplete", issue: readiness.issue, message: ACTIVATION_MESSAGES[readiness.issue!] },
      { status: 409 },
    );
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { demoGeneratedAt: true, cvDocuments: { orderBy: { createdAt: "desc" }, take: 1, select: { extractedText: true } } },
  });
  const cvText = account?.cvDocuments[0]?.extractedText?.trim();
  if (!cvText) {
    return NextResponse.json({ error: "activation_incomplete", issue: "upload_cv", message: ACTIVATION_MESSAGES.upload_cv }, { status: 409 });
  }
  if (!account || account.demoGeneratedAt) {
    return NextResponse.json(
      { error: "demo_already_generated", message: "La tua anteprima è già pronta. Continua per attivare la prova." },
      { status: 409 },
    );
  }

  const roleWords = parsed.data.targetRole.split(/\s+/).filter((word) => word.length >= 3);
  const roleNeedle = roleWords.sort((a, b) => b.length - a.length)[0] ?? parsed.data.targetRole;
  const job = await prisma.job.findFirst({
    where: { closedAt: null, title: { contains: roleNeedle, mode: "insensitive" } },
    orderBy: [{ postedAt: "desc" }, { cachedAt: "desc" }],
    select: { title: true, company: true, location: true, description: true },
  });

  const jobPosting = job
    ? `Ruolo: ${job.title}\nAzienda: ${job.company ?? "Azienda partner"}\nLocalità: ${job.location ?? "Da definire"}\n\n${job.description}`
    : `Ruolo target: ${parsed.data.targetRole}\n\nPersonalizza CV e lettera per questo ruolo. Evidenzia esclusivamente le esperienze e le competenze verificabili nel CV originale; non inventare risultati o aziende.`;

  try {
    const result = await optimizeCV({ cvText: cvText.slice(0, 24000), jobPosting });
    await prisma.user.update({ where: { id: user.id }, data: { demoGeneratedAt: new Date() } });
    await recordConversionEvent(AnalyticsEvent.ONBOARDING_DEMO_VIEWED, {
      userId: user.id,
      path: "/onboarding",
      properties: { targetRole: parsed.data.targetRole, matchedJob: Boolean(job) },
      dedupeKey: `onboarding_demo:${user.id}`,
    });

    return NextResponse.json({
      ok: true,
      target: {
        title: job?.title ?? parsed.data.targetRole,
        company: job?.company ?? null,
        location: job?.location ?? null,
        matchedJob: Boolean(job),
      },
      atsScore: result.atsScore,
      summary: result.optimizedCV.summary,
      skills: [...result.optimizedCV.skills.technical, ...result.optimizedCV.skills.tools].slice(0, 8),
      suggestions: result.suggestions.slice(0, 3),
      coverLetter: result.coverLetter,
    });
  } catch (error) {
    console.error("[/api/onboarding/demo]", error);
    return NextResponse.json(
      { error: "generation_failed", message: "Non siamo riusciti a preparare l'anteprima. Riprova tra qualche istante." },
      { status: 502 },
    );
  }
}

const cardTrialSchema = z.object({ jobId: z.string().trim().min(1).max(200) });

async function cardTrialPreview(request: NextRequest, userId: string) {
  const parsed = cardTrialSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "job_required", message: "Scegli un annuncio per creare la tua anteprima." }, { status: 400 });
  try {
    if (!await assertCardTrialPreviewAccess(userId)) {
      return NextResponse.json({ error: "card_trial_required", message: "Attiva la prova con carta prima di generare l’anteprima." }, { status: 403 });
    }
    const store = createPreviewStore(prisma);
    const existing = await store.read(userId);
    // Reject a forged/unavailable first choice before permanently binding the allowance.
    if (!existing) {
      const selectedJob = await prisma.job.findFirst({ where: { id: parsed.data.jobId, closedAt: null }, select: { id: true } });
      if (!selectedJob) return NextResponse.json({ error: "job_unavailable", message: "Scegli un annuncio disponibile." }, { status: 404 });
    }
    const result = await runCardTrialPreview({
      userId, jobId: parsed.data.jobId, store,
      generate: async () => {
        // No legacy demo/profile columns in the new cohort path.
        const [account, job] = await Promise.all([
          prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true, cvDocuments: { orderBy: { createdAt: "desc" }, take: 1, select: { extractedText: true } } } }),
          prisma.job.findFirst({ where: { id: parsed.data.jobId, closedAt: null }, select: { id: true, title: true, company: true, location: true, description: true } }),
        ]);
        if (!account?.emailVerified) throw new DefinitePreviewFailure("verify_email", 403);
        const cvText = account.cvDocuments[0]?.extractedText?.trim();
        if (!cvText) throw new DefinitePreviewFailure("upload_cv", 409);
        if (!job) throw new DefinitePreviewFailure("job_unavailable", 404);
        if (!await assertCardTrialPreviewAccess(userId)) throw new DefinitePreviewFailure("card_trial_required", 403);
        const jobPosting = `Ruolo: ${job.title}\nAzienda: ${job.company ?? "Non indicata"}\nLocalità: ${job.location ?? "Non indicata"}\n\n${job.description}`;
        const optimized = await generateCardTrialOptimization(cvText.slice(0, 24000), jobPosting);
        return { ...optimized, ok: true, target: { jobId: job.id, title: job.title, company: job.company, location: job.location, matchedJob: true } };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    // Missing rollout schema, unknown provider results and lost persistence all fail closed.
    console.error("[/api/onboarding/demo/card-trial]", error instanceof PreviewError ? error.code : "preview_unavailable");
    const code = error instanceof PreviewError ? error.code : "preview_unavailable";
    const status = error instanceof PreviewError ? error.status : 503;
    const message = code === "preview_in_progress" ? "La tua anteprima è in preparazione. Attendi prima di riprovare."
      : code === "preview_job_locked" ? "Hai già scelto un annuncio per questa anteprima."
      : code === "preview_reconciliation_required" ? "Stiamo verificando l’esito della generazione. Contatta l’assistenza: non genereremo un duplicato."
      : "L’anteprima non è disponibile in questo momento.";
    return NextResponse.json({ error: code, message }, { status });
  }
}

/** Read the saved output after reload without making another provider call. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isCardTrialCohort(user)) return NextResponse.json({ error: "not_available" }, { status: 404 });
  try {
    if (!await hasCardTrialPreviewWindow(user.id)) return NextResponse.json({ error: "card_trial_required" }, { status: 403 });
    const preview = await createPreviewStore(prisma).read(user.id);
    if (!preview) return NextResponse.json({ state: "unused", result: null }, { headers: { "Cache-Control": "private, no-store" } });
    const state = (preview.state === "reserved" && preview.leaseExpiresAt.getTime() <= Date.now()) || (preview.state === "failed" && (preview.attempts ?? 0) >= 3) ? "reconciliation_required" : preview.state;
    return NextResponse.json({ state, jobId: preview.jobId, result: preview.state === "succeeded" ? preview.result : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "preview_unavailable" }, { status: 503 });
  }
}
