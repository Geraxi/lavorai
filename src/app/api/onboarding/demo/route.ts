import { onboardingAccessBlock } from "@/lib/onboarding-access";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { optimizeCV } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ACTIVATION_MESSAGES, getActivationReadiness } from "@/lib/activation-readiness";

import { titleMatchesAnyRole } from "@/lib/role-match";
import { autoApplyPreferenceMismatch, parsePreferenceList, isAvoidedCompany } from "@/lib/auto-apply-preferences";

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
    select: { demoGeneratedAt: true, demoPreviewJson: true, preferences: true, avoidCompanies: true, cvDocuments: { orderBy: { createdAt: "desc" }, take: 1, select: { extractedText: true } } },
  });
  const cvText = account?.cvDocuments[0]?.extractedText?.trim();
  if (!account || !cvText) {
    return NextResponse.json({ error: "activation_incomplete", issue: "upload_cv", message: ACTIVATION_MESSAGES.upload_cv }, { status: 409 });
  }
  if (account?.demoPreviewJson) return NextResponse.json(JSON.parse(account.demoPreviewJson));
  const claimedAt = new Date();
  const claim = await prisma.user.updateMany({
    where: { id: user.id, demoPreviewJson: null, OR: [{ demoClaimedAt: null }, { demoClaimedAt: { lt: new Date(Date.now() - 120_000) } }] },
    data: { demoClaimedAt: claimedAt },
  });
  if (!claim.count) return NextResponse.json({ error: "preview_in_progress", message: "Anteprima in preparazione. Riprova tra poco." }, { status: 409 });

  try {
  const roleWords = parsed.data.targetRole.split(/\s+/).filter((word) => word.length >= 3);
  const roleNeedle = roleWords.sort((a, b) => b.length - a.length)[0] ?? parsed.data.targetRole;
  const candidates = await prisma.job.findMany({
    where: { closedAt: null, title: { contains: roleNeedle, mode: "insensitive" } },
    orderBy: [{ postedAt: "desc" }, { cachedAt: "desc" }], take: 100,
  });
  const prefs = account.preferences;
  const locations = parsePreferenceList(prefs?.locationsJson) ?? [];
  const roles = parsePreferenceList(prefs?.rolesJson) ?? [];
  const jobs = prefs && locations.length ? candidates.filter((job) =>
    titleMatchesAnyRole(job.title, roles) && !isAvoidedCompany(job.company, account.avoidCompanies)
    && !autoApplyPreferenceMismatch(job, prefs, locations)
  ).slice(0, 3) : [];
  const job = jobs[0];

  const jobPosting = job
    ? `Ruolo: ${job.title}\nAzienda: ${job.company ?? "Azienda partner"}\nLocalità: ${job.location ?? "Da definire"}\n\n${job.description}`
    : `Ruolo target: ${parsed.data.targetRole}\n\nPersonalizza CV e lettera per questo ruolo. Evidenzia esclusivamente le esperienze e le competenze verificabili nel CV originale; non inventare risultati o aziende.`;

    const result = await optimizeCV({ cvText: cvText.slice(0, 24000), jobPosting, jobLang: "it" });

    const preview = {
      ok: true,
      target: {
        title: job?.title ?? parsed.data.targetRole,
        company: job?.company ?? null,
        location: job?.location ?? null,
        matchedJob: Boolean(job),
      },
      offers: jobs.map(({ title, company, location }) => ({ title, company, location })),
      atsScore: result.atsScore,
      summary: result.optimizedCV.summary,
      skills: [...result.optimizedCV.skills.technical, ...result.optimizedCV.skills.tools].slice(0, 8),
      suggestions: result.suggestions.slice(0, 3),
      coverLetter: result.coverLetter,
    };
    const saved = await prisma.user.updateMany({ where: { id: user.id, demoClaimedAt: claimedAt }, data: { demoGeneratedAt: new Date(), demoPreviewJson: JSON.stringify(preview), demoClaimedAt: null } });
    if (!saved.count) return NextResponse.json({ error: "preview_replaced" }, { status: 409 });
    return NextResponse.json(preview);
  } catch (error) {
    await prisma.user.updateMany({ where: { id: user.id, demoClaimedAt: claimedAt }, data: { demoClaimedAt: null } });
    console.error("[/api/onboarding/demo]", error);
    return NextResponse.json(
      { error: "generation_failed", message: "Non siamo riusciti a preparare l'anteprima. Riprova tra qualche istante." },
      { status: 502 },
    );
  }
}
