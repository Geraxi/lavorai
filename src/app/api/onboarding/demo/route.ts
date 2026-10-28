import { catalogueWhere } from "@/lib/job-catalogue-policy";
import { onboardingAccessBlock } from "@/lib/onboarding-access";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { optimizeCV } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ACTIVATION_MESSAGES, getActivationReadiness } from "@/lib/activation-readiness";
import { AnalyticsEvent } from "@/lib/analytics";
import { recordConversionEvent } from "@/lib/conversion-events";

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

  const block = onboardingAccessBlock(user);
  if (block) return NextResponse.json(block, { status: block.status });

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
    where: { AND: [catalogueWhere()], closedAt: null, title: { contains: roleNeedle, mode: "insensitive" } },
    orderBy: [{ postedAt: "desc" }, { cachedAt: "desc" }],
    select: { title: true, company: true, location: true, description: true },
  });

  const jobPosting = job
    ? `Ruolo: ${job.title}\nAzienda: ${job.company ?? "Azienda partner"}\nLocalità: ${job.location ?? "Da definire"}\n\n${job.description}`
    : `Ruolo target: ${parsed.data.targetRole}\n\nPersonalizza CV e lettera per questo ruolo. Evidenzia esclusivamente le esperienze e le competenze verificabili nel CV originale; non inventare risultati o aziende.`;

  try {
    const result = await optimizeCV({ cvText: cvText.slice(0, 24000), jobPosting, jobLang: "it" });
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
