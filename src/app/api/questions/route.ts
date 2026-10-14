import { reuseCvAnswers } from "@/lib/cv-answer-reuse";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { rowToProfile } from "@/lib/cv-profile-types";
import { suggestAnswerFromCv } from "@/lib/cv-question-suggestions";
import {
  completesApplicationQuestion, encodeExplicitApplicationAnswers, isReusableProfileQuestion,
  matchingExplicitApplicationAnswer, normalizeQuestionLabel, parseApplicationQuestion,
  parseScopedApplicationAnswers, permitsQuestionAnswer, questionFingerprint,
  type ExplicitApplicationAnswer,
} from "@/lib/application-question-answers";

export const runtime = "nodejs";

/** One card per exact form question. Generic declarations never inherit consent
 * from a global UserAnswer or another application with the same label. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [waiting, globalAnswers, profileRow] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id, status: "needs_answers" },
      select: { id: true, pendingQuestionsJson: true, userProvidedAnswersJson: true,
        job: { select: { company: true, title: true, location: true, description: true, url: true } } },
    }),
    prisma.userAnswer.findMany({ where: { userId: user.id, source: "user" }, select: { label: true, kind: true, answer: true } }),
    prisma.cVProfile.findUnique({ where: { userId: user.id } }),
  ]);
  const profile = profileRow ? rowToProfile(profileRow) : null;
  const questions = waiting.flatMap(app => {
    const values = safeParse(app.pendingQuestionsJson ?? "[]");
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    return values.flatMap(value => {
      const question = parseApplicationQuestion(value);
      if (!question) return [];
      const fingerprint = questionFingerprint(question);
      if (seen.has(fingerprint)) return [];
      seen.add(fingerprint);
      const explicit = matchingExplicitApplicationAnswer(app.userProvidedAnswersJson, app.id, question);
      const cv = explicit ? null : suggestAnswerFromCv(question.label, question.kind, question.options, profile, user.yearsExperience);
      const global = isReusableProfileQuestion(question) ? globalAnswers.find(answer =>
        normalizeQuestionLabel(answer.label) === normalizeQuestionLabel(question.label)
        && isReusableProfileQuestion(answer) && answer.answer && permitsQuestionAnswer(question, answer.answer))?.answer : null;
      const suggestion = explicit ? null : cv ?? global ?? null;
      return [{
        id: `${app.id}:${fingerprint}`, applicationId: app.id, fingerprint,
        labelKey: normalizeQuestionLabel(question.label), ...question,
        answer: explicit?.answer ?? "", source: explicit ? "user" : "pending",
        suggestion, suggestionSource: cv ? "cv" : global ? "previous_user" : null,
        requiresApplicationScope: !isReusableProfileQuestion(question),
        applications: [{ id: app.id, company: app.job.company ?? "Azienda", title: app.job.title,
          location: app.job.location, description: app.job.description, url: app.job.url }],
      }];
    });
  });
  return NextResponse.json({ locale: user.locale, questions, waitingApplications: waiting.length });
}

type SubmittedAnswer = { applicationId: string; fingerprint: string; answer: string };

/** Explicit assertions are bound to one owned application's current form.
 * Answering questions never grants application consent or a legal permission
 * for another employer, even when normalized question labels are identical. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { reuseCvOnly?: boolean; answers?: SubmittedAnswer[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || (body.answers != null && (!Array.isArray(body.answers) || body.answers.length > 100
      || body.answers.some(answer => !answer || typeof answer.applicationId !== "string" || !answer.applicationId
        || typeof answer.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(answer.fingerprint)
        || typeof answer.answer !== "string" || answer.answer.length > 2000)))) {
    return NextResponse.json({ error: "invalid_answers" }, { status: 400 });
  }
  if (body.reuseCvOnly === true) {
    await reuseCvAnswers(user.id, user.yearsExperience);
    return NextResponse.json({ ok: true });
  }

  const waiting = await prisma.application.findMany({
    where: { userId: user.id, status: "needs_answers" },
    select: { id: true, pendingQuestionsJson: true, userProvidedAnswersJson: true,
      submitConfirmation: true, consentGrantedAt: true, startedAt: true, submittedAt: true, submittedVia: true,
      user: { select: { preferences: { select: { autoApplyMode: true } } } } },
  });
  const appById = new Map(waiting.map(app => [app.id, app]));
  const changes = new Map<string, Map<string, ExplicitApplicationAnswer>>();
  let saved = 0;
  // Validate the entire batch before any write. A stale fingerprint is never
  // silently rebound to a new declaration or another form's option set.
  for (const item of body.answers ?? []) {
    const answer = item.answer.trim();
    if (!answer) continue;
    const app = appById.get(item.applicationId);
    if (!app) return NextResponse.json({ error: "application_not_found" }, { status: 404 });
    const pending = safeParse(app.pendingQuestionsJson ?? "[]");
    const question = Array.isArray(pending) ? pending.map(parseApplicationQuestion)
      .find(value => value && questionFingerprint(value) === item.fingerprint) : null;
    if (!question) return NextResponse.json({ error: "question_changed", applicationId: app.id }, { status: 409 });
    if (!permitsQuestionAnswer(question, answer)) return NextResponse.json({ error: "invalid_answer_option", applicationId: app.id }, { status: 400 });
    const scoped = changes.get(app.id) ?? new Map<string, ExplicitApplicationAnswer>();
    if (scoped.has(item.fingerprint) && scoped.get(item.fingerprint)!.answer !== answer) return NextResponse.json({ error: "invalid_answers" }, { status: 400 });
    scoped.set(item.fingerprint, { ...question, fingerprint: item.fingerprint, answer, source: "user", answeredAt: new Date().toISOString() });
    changes.set(app.id, scoped);
  }

  // Save with compare-and-set: concurrent answers cannot overwrite each other.
  // Stale/foreign/currently submitted applications never receive an assertion.
  const prepared = new Map<string, string>();
  for (const [applicationId, edits] of changes) {
    const app = appById.get(applicationId)!;
    const merged = new Map(parseScopedApplicationAnswers(app.userProvidedAnswersJson, app.id).map(answer => [answer.fingerprint, answer]));
    for (const [fingerprint, answer] of edits) merged.set(fingerprint, answer);
    if (merged.size > 100) return NextResponse.json({ error: "too_many_answers" }, { status: 400 });
    const json = encodeExplicitApplicationAnswers(applicationId, [...merged.values()]);
    if (json.length > 1_000_000) return NextResponse.json({ error: "answers_too_large" }, { status: 400 });
    prepared.set(applicationId, json);
  }
  for (const [applicationId, json] of prepared) {
    const app = appById.get(applicationId)!;
    const changed = await prisma.application.updateMany({
      where: { id: app.id, userId: user.id, status: "needs_answers", startedAt: app.startedAt,
        pendingQuestionsJson: app.pendingQuestionsJson, userProvidedAnswersJson: app.userProvidedAnswersJson,
        submitConfirmation: app.submitConfirmation, submittedAt: app.submittedAt, submittedVia: app.submittedVia },
      data: { userProvidedAnswersJson: json },
    });
    if (changed.count !== 1) return NextResponse.json({ error: "questions_changed_reload" }, { status: 409 });
    app.userProvidedAnswersJson = json;
    saved += changes.get(applicationId)!.size;
  }

  const profileRow = await prisma.cVProfile.findUnique({ where: { userId: user.id } });
  const profile = profileRow ? rowToProfile(profileRow) : null;
  let requeued = 0;
  for (const app of waiting) {
    const pending = safeParse(app.pendingQuestionsJson ?? "[]");
    if (!Array.isArray(pending) || !pending.length || app.submitConfirmation !== "NOT_SUBMITTED" || app.submittedAt || app.submittedVia) continue;
    const questions = pending.map(parseApplicationQuestion);
    if (questions.some(question => question === null)) continue;
    const mode = app.user.preferences?.autoApplyMode;
    if (mode !== "auto" && (!app.consentGrantedAt || !["manual", "hybrid"].includes(mode ?? ""))) continue;
    let usedCv = false;
    const allAnswered = questions.every(question => {
      if (!question) return false;
      const explicit = matchingExplicitApplicationAnswer(app.userProvidedAnswersJson, app.id, question);
      if (explicit) return completesApplicationQuestion(question, explicit.answer);
      // CV facts never imply a declaration, agreement or legal permission.
      if (!isReusableProfileQuestion(question)) return false;
      const answer = suggestAnswerFromCv(question.label, question.kind, question.options, profile, user.yearsExperience);
      if (!answer || !completesApplicationQuestion(question, answer)) return false;
      usedCv = true;
      return true;
    });
    if (!allAnswered) continue;
    const changed = await prisma.application.updateMany({
      where: {
        id: app.id, userId: user.id, status: "needs_answers", submitConfirmation: "NOT_SUBMITTED",
        submittedAt: null, submittedVia: null, startedAt: app.startedAt,
        pendingQuestionsJson: app.pendingQuestionsJson, userProvidedAnswersJson: app.userProvidedAnswersJson,
        consentGrantedAt: app.consentGrantedAt,
        user: { is: { preferences: { is: { autoApplyMode: mode } },
          ...(usedCv && profileRow ? { cvProfile: { is: { id: profileRow.id, updatedAt: profileRow.updatedAt } }, yearsExperience: user.yearsExperience ?? null } : {}),
        } },
      },
      data: { status: "queued", startedAt: null, errorMessage: null, pendingQuestionsJson: null },
    });
    if (changed.count !== 1) continue;
    await enqueueApplication(app.id, { preserveClaim: true }).catch(error =>
      console.error(`[questions] queue notification ${app.id} failed; durable queue retained`, error),
    );
    requeued++;
  }
  return NextResponse.json({ ok: true, requeued, saved, remainingApplications: waiting.length - requeued });
}
function safeParse(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
