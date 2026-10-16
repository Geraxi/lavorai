import { answerContinuationIneligibility, answerConfirmationDigest, continuationSelect } from "@/lib/application-answer-continuation";
import { continuationGuidance } from "@/lib/application-continuation-guidance";
import { queueAnswerContinuation } from "@/lib/application-worker-gates";
import { candidateFacts, resolveCandidateFact } from "@/lib/candidate-facts";
import { parseAnswers } from "@/lib/application-answers";
import { reuseCvAnswers } from "@/lib/cv-answer-reuse";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enqueueApplication } from "@/lib/application-queue";
import { rowToProfile } from "@/lib/cv-profile-types";
import {
  completesApplicationQuestion, encodeExplicitApplicationAnswers, isReusableProfileQuestion,
  resolveExplicitApplicationAnswer, normalizeQuestionLabel, parseApplicationQuestion,
  parseScopedApplicationAnswers, permitsQuestionAnswer, questionFingerprint,
  type ExplicitApplicationAnswer,
} from "@/lib/application-question-answers";

export const runtime = "nodejs";

/** One card per exact form question. Generic declarations never inherit consent
 * from a global UserAnswer or another application with the same label. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [waiting, globalAnswers, profileRow, preferences, userFacts] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id, status: "needs_answers" },
      select: { ...continuationSelect,
        job: { select: { company: true, title: true, location: true, description: true, url: true } } },
    }),
    prisma.userAnswer.findMany({ where: { userId: user.id, source: "user" }, select: { label: true, kind: true, answer: true, source: true, answeredAt: true, optionsJson: true } }),
    prisma.cVProfile.findUnique({ where: { userId: user.id } }),
    prisma.userPreferences.findUnique({ where: { userId: user.id }, select: { applicationAnswersJson: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { email: true, yearsExperience: true, englishLevel: true, noticePeriod: true, privacyConsentAt: true } }),
  ]);
  const profile = profileRow ? rowToProfile(profileRow) : null;
  const facts = candidateFacts(profile, userFacts ?? user, parseAnswers(preferences?.applicationAnswersJson), globalAnswers);
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
      const explicit = resolveExplicitApplicationAnswer(app.userProvidedAnswersJson, app.id, question);
      const resolved = explicit.answer || explicit.conflict ? null : resolveCandidateFact(question, { facts });
      const suggestion = resolved?.answer ?? null;
      return [{
        id: `${app.id}:${fingerprint}`, applicationId: app.id, fingerprint,
        labelKey: normalizeQuestionLabel(question.label), ...question,
        answer: explicit.answer ?? "", source: explicit.answer ? "user" : "pending",
        suggestion, suggestionSource: resolved?.provenance[0]?.source ?? null,
        provenance: resolved?.provenance ?? [], conflict: explicit.conflict || resolved?.conflict || false,
        requiresApplicationScope: !isReusableProfileQuestion(question),
        applications: [{ id: app.id, company: app.job.company ?? "Azienda", title: app.job.title,
          location: app.job.location, description: app.job.description, url: app.job.url }],
      }];
    });
  });
  const continuations = waiting.map(app => {
    const appQuestions = questions.filter(question => question.applicationId === app.id);
    const complete = appQuestions.length > 0 && appQuestions.every(question => completesApplicationQuestion(question, question.answer || question.suggestion || ""));
    const reason = !userFacts?.privacyConsentAt ? "privacy_consent_missing" : answerContinuationIneligibility(app, "paused", app.job.url) ?? (complete ? null : "answers_incomplete");
    return { applicationId: app.id, company: app.job.company, title: app.job.title, canResume: !reason, reason,
      guidance: reason ? continuationGuidance(reason, app.id, user.locale === "en") : null,
      proofDigest: !reason && app.answerContinuationJson ? answerConfirmationDigest(app.answerContinuationJson, app.userProvidedAnswersJson, facts) : null };
  });
  return NextResponse.json({ locale: user.locale, questions, continuations, waitingApplications: waiting.length });
}

type SubmittedAnswer = { applicationId: string; fingerprint: string; answer: string };

/** Explicit assertions are bound to one owned application's current form.
 * Answering questions never grants application consent or a legal permission
 * for another employer, even when normalized question labels are identical. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { reuseCvOnly?: boolean; answers?: SubmittedAnswer[]; resumeApplications?: Array<{ applicationId: string; proofDigest: string }> };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || (body.answers != null && (!Array.isArray(body.answers) || body.answers.length > 100
      || body.answers.some(answer => !answer || typeof answer.applicationId !== "string" || !answer.applicationId
        || typeof answer.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(answer.fingerprint)
        || typeof answer.answer !== "string" || answer.answer.length > 2000)))) {
    return NextResponse.json({ error: "invalid_answers" }, { status: 400 });
  }
  if (body.resumeApplications != null && (!Array.isArray(body.resumeApplications) || body.resumeApplications.length > 100
    || body.resumeApplications.some(item => !item || typeof item.applicationId !== "string" || !item.applicationId
      || typeof item.proofDigest !== "string" || !/^[a-f0-9]{64}$/.test(item.proofDigest)))) return NextResponse.json({ error: "invalid_confirmation" }, { status: 400 });
  if (body.reuseCvOnly === true) {
    await reuseCvAnswers(user.id, user.yearsExperience);
    return NextResponse.json({ ok: true });
  }

  const waiting = await prisma.application.findMany({
    where: { userId: user.id, status: "needs_answers" },
    select: { ...continuationSelect },
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
    if (app.submitConfirmation !== "NOT_SUBMITTED" || app.submittedAt || app.submittedVia || app.submissionReceiptJson || app.completedAt)
      return NextResponse.json({ error: "application_outcome_uncertain" }, { status: 409 });
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
    const merged = [...parseScopedApplicationAnswers(app.userProvidedAnswersJson, app.id).filter(answer => !edits.has(answer.fingerprint)), ...edits.values()];
    if (merged.length > 100) return NextResponse.json({ error: "too_many_answers" }, { status: 400 });
    const json = encodeExplicitApplicationAnswers(applicationId, merged);
    if (json.length > 1_000_000) return NextResponse.json({ error: "answers_too_large" }, { status: 400 });
    prepared.set(applicationId, json);
  }
  for (const [applicationId, json] of prepared) {
    const app = appById.get(applicationId)!;
    const changed = await prisma.application.updateMany({
      where: { id: app.id, userId: user.id, status: "needs_answers", startedAt: app.startedAt,
        pendingQuestionsJson: app.pendingQuestionsJson, userProvidedAnswersJson: app.userProvidedAnswersJson,
        submitConfirmation: "NOT_SUBMITTED", submittedAt: null, submittedVia: null,
        submissionReceiptJson: null, completedAt: null, consentGrantedAt: app.consentGrantedAt,
        answerContinuationJson: app.answerContinuationJson },
      data: { userProvidedAnswersJson: json },
    });
    if (changed.count !== 1) return NextResponse.json({ error: "questions_changed_reload" }, { status: 409 });
    app.userProvidedAnswersJson = json;
    saved += changes.get(applicationId)!.size;
  }

  let requeued = 0;
  const held: Array<{ applicationId: string; reason: string }> = [];
  for (const item of body.resumeApplications ?? []) {
    const app = appById.get(item.applicationId);
    if (!app) { held.push({ applicationId: item.applicationId, reason: "application_not_found" }); continue; }
    const result = await queueAnswerContinuation({ applicationId: app.id, userId: user.id,
      proofDigest: item.proofDigest, expectedAnswersJson: app.userProvidedAnswersJson });
    if (result !== "queued") { held.push({ applicationId: app.id, reason: result ?? "continuation_held" }); continue; }
    await enqueueApplication(app.id, { preserveClaim: true }).catch(error =>
      console.error(`[questions] queue notification ${app.id} failed; durable queue retained`, error));
    requeued++;
  }
  return NextResponse.json({ ok: true, requeued, saved, held, remainingApplications: waiting.length - requeued });
}

function safeParse(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
