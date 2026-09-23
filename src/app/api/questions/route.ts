import { reuseCvAnswers } from "@/lib/cv-answer-reuse";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { normalizeLabel } from "@/lib/portal-adapters/ai-answer";
import { rowToProfile } from "@/lib/cv-profile-types";
import { suggestAnswerFromCv } from "@/lib/cv-question-suggestions";

export const runtime = "nodejs";

/**
 * GET /api/questions
 * Domande dei form, risposte salvate e suggerimenti fattuali dal CV.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [answers, waitingApps, profileRow] = await Promise.all([prisma.userAnswer.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, labelKey: true, label: true, kind: true, optionsJson: true, answer: true, source: true },
  }), prisma.application.findMany({
    where: { userId: user.id, status: "needs_answers" },
    select: { id: true, pendingQuestionsJson: true, job: { select: { company: true, title: true } } },
  }), prisma.cVProfile.findUnique({ where: { userId: user.id } })]);
  const profile = profileRow ? rowToProfile(profileRow) : null;

  const affected = new Map<string, Array<{ id: string; company: string; title: string }>>();
  for (const app of waitingApps) {
    const pending = safeParse(app.pendingQuestionsJson ?? "[]");
    if (!Array.isArray(pending)) continue;
    const keys = new Set(pending.map((q) => normalizeLabel(typeof q?.label === "string" ? q.label : "")));
    for (const key of keys) {
      if (!key) continue;
      const list = affected.get(key) ?? [];
      list.push({ id: app.id, company: app.job.company ?? "Azienda", title: app.job.title });
      affected.set(key, list);
    }
  }

  return NextResponse.json({
    locale: user.locale,
    questions: answers.map((q) => {
      const parsedOptions = q.optionsJson ? safeParse(q.optionsJson) : null;
      const options = Array.isArray(parsedOptions) ? parsedOptions.filter((value): value is string => typeof value === "string") : undefined;
      return {
      id: q.id,
      labelKey: q.labelKey,
      label: q.label,
      kind: q.kind,
      options,
      answer: q.answer ?? "",
      source: q.source,
      suggestion: q.answer?.trim() ? null : suggestAnswerFromCv(q.label, q.kind, options, profile, user.yearsExperience),
      applications: affected.get(q.labelKey) ?? [],
    }; }),
    waitingApplications: waitingApps.length,
  });
}

/**
 * POST /api/questions
 * Body: { answers: [{ labelKey, answer }] }
 * Salva le risposte e ri-accoda le candidature in "needs_answers" le cui
 * domande sono ora tutte risposte.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { reuseCvOnly?: boolean; answers?: Array<{ labelKey?: string; answer?: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  await reuseCvAnswers(user.id, user.yearsExperience);
  if (body.reuseCvOnly === true) return NextResponse.json({ ok: true });
  const answers = Array.isArray(body.answers) ? body.answers : [];

  // 1. Salva le risposte (solo quelle non vuote).
  for (const a of answers) {
    const labelKey = (a.labelKey ?? "").trim();
    const answer = (a.answer ?? "").trim();
    if (!labelKey || !answer) continue;
    await prisma.userAnswer
      .update({
        where: { userId_labelKey: { userId: user.id, labelKey } },
        // Una modifica dell'utente vince sempre sulla risposta AI/regola.
        data: { answer: answer.slice(0, 2000), answeredAt: new Date(), source: "user" },
      })
      .catch((error) => {
        console.error("[questions] save answer failed", error);
        throw error;
      });
  }

  // 2. Ricostruisci la mappa risposte attuale dell'utente.
  const answered = await prisma.userAnswer.findMany({
    where: { userId: user.id, NOT: { answer: null } },
    select: { labelKey: true, answer: true },
  });
  const answeredKeys = new Set(
    answered.filter((r) => r.answer && r.answer.trim()).map((r) => r.labelKey),
  );

  // 3. Ri-accoda le candidature in needs_answers ora complete.
  const waiting = await prisma.application.findMany({
    where: { userId: user.id, status: "needs_answers" },
    select: { id: true, pendingQuestionsJson: true },
  });
  let requeued = 0;
  for (const app of waiting) {
    const qs = safeParse(app.pendingQuestionsJson ?? "[]") as Array<{ label: string }>;
    // Ignora le domande senza label leggibile (campi interni react-select):
    // non sono rispondibili dall'utente e non devono bloccare il re-queue.
    const realQs = Array.isArray(qs)
      ? qs.filter((q) => normalizeLabel(q.label ?? "").length >= 3)
      : [];
    const allAnswered =
      realQs.length > 0 &&
      realQs.every((q) => answeredKeys.has(normalizeLabel(q.label)));
    if (!allAnswered) continue;
    await prisma.application.update({
      where: { id: app.id },
      data: { status: "queued", startedAt: null, errorMessage: null, pendingQuestionsJson: null },
    });
    await enqueueApplication(app.id).catch((err) =>
      console.error(`[questions] requeue ${app.id} failed`, err),
    );
    requeued++;
  }

  const stillPending = await prisma.userAnswer.count({
    where: { userId: user.id, OR: [{ answer: null }, { answer: "" }] },
  });

  return NextResponse.json({ ok: true, requeued, stillPending });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
