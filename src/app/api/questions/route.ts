import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { normalizeLabel } from "@/lib/portal-adapters/ai-answer";

export const runtime = "nodejs";

/**
 * GET /api/questions
 * Domande dei form di candidatura a cui l'utente non ha ancora risposto.
 * (UserAnswer con answer vuoto.) + quante candidature sono in attesa.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pending = await prisma.userAnswer.findMany({
    where: { userId: user.id, OR: [{ answer: null }, { answer: "" }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, labelKey: true, label: true, kind: true, optionsJson: true },
  });
  const waitingApps = await prisma.application.count({
    where: { userId: user.id, status: "needs_answers" },
  });

  return NextResponse.json({
    questions: pending.map((q) => ({
      id: q.id,
      labelKey: q.labelKey,
      label: q.label,
      kind: q.kind,
      options: q.optionsJson ? safeParse(q.optionsJson) : undefined,
    })),
    waitingApplications: waitingApps,
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

  let body: { answers?: Array<{ labelKey?: string; answer?: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const answers = Array.isArray(body.answers) ? body.answers : [];

  // 1. Salva le risposte (solo quelle non vuote).
  for (const a of answers) {
    const labelKey = (a.labelKey ?? "").trim();
    const answer = (a.answer ?? "").trim();
    if (!labelKey || !answer) continue;
    await prisma.userAnswer
      .update({
        where: { userId_labelKey: { userId: user.id, labelKey } },
        data: { answer: answer.slice(0, 2000), answeredAt: new Date() },
      })
      .catch(() => void 0);
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
