import { reuseCvAnswers } from "@/lib/cv-answer-reuse";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { normalizeLabel } from "@/lib/portal-adapters/ai-answer";
import { rowToProfile } from "@/lib/cv-profile-types";
import { suggestAnswerFromCv } from "@/lib/cv-question-suggestions";

export const runtime = "nodejs";

type QuestionRow = {
  id: string;
  labelKey: string;
  label: string;
  kind: string;
  optionsJson: string | null;
  answer: string | null;
  source: string;
};

type PendingQuestion = {
  label?: unknown;
  kind?: unknown;
  options?: unknown;
};

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
  // Older applications can have pendingQuestionsJson without the matching
  // UserAnswer row. Rebuild those rows here so the user can still answer them.
  const questionRows = new Map<string, QuestionRow>();
  for (const question of answers) {
    // Alcune righe create dalle prime versioni del flow avevano una
    // labelKey non normalizzata. Esporre sempre la chiave canonica evita
    // che una risposta venga salvata correttamente ma non associata alla
    // domanda che blocca la candidatura.
    const labelKey = normalizeLabel(question.label) || question.labelKey;
    const current = questionRows.get(labelKey);
    if (!current || (!current.answer?.trim() && Boolean(question.answer?.trim()))) {
      questionRows.set(labelKey, { ...question, labelKey });
    }
  }
  for (const app of waitingApps) {
    const pending = safeParse(app.pendingQuestionsJson ?? "[]");
    if (!Array.isArray(pending)) continue;
    for (const question of pending as PendingQuestion[]) {
      const label = typeof question?.label === "string" ? question.label.trim() : "";
      const key = normalizeLabel(label);
      if (!key) continue;
      const list = affected.get(key) ?? [];
      list.push({ id: app.id, company: app.job.company ?? "Azienda", title: app.job.title });
      affected.set(key, list);
      if (!questionRows.has(key)) {
        const options = Array.isArray(question?.options)
          ? question.options.filter((option): option is string => typeof option === "string")
          : undefined;
        questionRows.set(key, {
          id: `pending-${key}`,
          labelKey: key,
          label: label || "Domanda richiesta dalla candidatura",
          kind: typeof question?.kind === "string" ? question.kind : "text",
          optionsJson: options?.length ? JSON.stringify(options) : null,
          answer: null,
          source: "pending",
        });
      }
    }
  }

  return NextResponse.json({
    locale: user.locale,
    questions: [...questionRows.values()].map((q) => {
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

  // Read pending form metadata before writing. It lets saves repair legacy
  // applications that did not get a UserAnswer row when they were blocked.
  const waiting = await prisma.application.findMany({
    where: { userId: user.id, status: "needs_answers" },
    select: { id: true, pendingQuestionsJson: true },
  });
  const pendingByKey = new Map<string, { label: string; kind: string; optionsJson: string | null }>();
  for (const app of waiting) {
    const pending = safeParse(app.pendingQuestionsJson ?? "[]");
    if (!Array.isArray(pending)) continue;
    for (const question of pending as PendingQuestion[]) {
      const label = typeof question?.label === "string" ? question.label.trim() : "";
      const labelKey = normalizeLabel(label);
      if (!labelKey || pendingByKey.has(labelKey)) continue;
      const options = Array.isArray(question?.options)
        ? question.options.filter((option): option is string => typeof option === "string")
        : undefined;
      pendingByKey.set(labelKey, {
        label: label || "Domanda richiesta dalla candidatura",
        kind: typeof question?.kind === "string" ? question.kind : "text",
        optionsJson: options?.length ? JSON.stringify(options) : null,
      });
    }
  }

  // 1. Salva le risposte (solo quelle non vuote).
  for (const a of answers) {
    const labelKey = (a.labelKey ?? "").trim();
    const answer = (a.answer ?? "").trim();
    if (!labelKey || !answer) continue;
    const pending = pendingByKey.get(labelKey);
    await prisma.userAnswer
      .upsert({
        where: { userId_labelKey: { userId: user.id, labelKey } },
        // Una modifica dell'utente vince sempre sulla risposta AI/regola.
        update: { answer: answer.slice(0, 2000), answeredAt: new Date(), source: "user" },
        create: {
          userId: user.id,
          labelKey,
          label: pending?.label ?? "Domanda richiesta dalla candidatura",
          kind: pending?.kind ?? "text",
          optionsJson: pending?.optionsJson ?? null,
          answer: answer.slice(0, 2000),
          answeredAt: new Date(),
          source: "user",
        },
      })
      .catch((error) => {
        console.error("[questions] save answer failed", error);
        throw error;
      });
  }

  // 2. Ricostruisci la mappa risposte attuale dell'utente.
  const answered = await prisma.userAnswer.findMany({
    where: { userId: user.id, NOT: { answer: null } },
    select: { labelKey: true, label: true, answer: true },
  });
  const answeredKeys = new Set(
    answered
      .filter((r) => r.answer && r.answer.trim())
      .map((r) => normalizeLabel(r.label) || r.labelKey),
  );

  // 3. Ri-accoda le candidature in needs_answers ora complete.
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

  const remainingApplications = waiting.length - requeued;
  const stillPending = await prisma.userAnswer.count({
    where: { userId: user.id, OR: [{ answer: null }, { answer: "" }] },
  });

  return NextResponse.json({ ok: true, requeued, stillPending, remainingApplications, saved: answers.length });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
