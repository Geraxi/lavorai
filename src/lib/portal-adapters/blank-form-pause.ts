import type { Page } from "playwright";
import type { ApplyInput, ApplyOutcome, PendingQuestion } from "./types";
import { resolveCandidateFact } from "../candidate-facts";
import { completesApplicationQuestion, resolveScopedQuestionAnswer } from "../application-question-answers";

/** Required questions on a fresh, untouched form that neither the candidate's
 * application-scoped answers nor verified profile facts can complete. */
export async function unanswerableBlankFormQuestions(page: Page, input: ApplyInput): Promise<PendingQuestion[]> {
  const { inspectRequiredQuestions } = await import("./ai-answer");
  const { buildAnswerContext } = await import("./web-form");
  const context = buildAnswerContext(input);
  const questions = await inspectRequiredQuestions(page);
  return questions.filter(question => {
    const scoped = resolveScopedQuestionAnswer(input.storedAnswers, question);
    if (scoped.conflict) return true;
    const fact = scoped.answer ? null : resolveCandidateFact(question, context, true);
    const answer = scoped.answer ?? fact?.answer;
    // A factual search value can be tried later; it never selects a choice now.
    if (!scoped.answer && fact?.answer && question.kind === "react-select") return false;
    return !answer || !completesApplicationQuestion({ ...question, options: question.options ?? [] }, answer);
  });
}

/**
 * The only resumable pause: called BEFORE any fill, upload or click that could
 * transmit candidate data (modern ATS forms autosave and upload async).
 * Returns an outcome to stop with, or null to continue with candidate data.
 */
export async function blankFormPause(page: Page, input: ApplyInput, provider: string): Promise<ApplyOutcome | null> {
  if (!input.onPreTransmissionPause) return null;
  const missing = await unanswerableBlankFormQuestions(page, input);
  if (missing.length) {
    // Nothing has been typed, uploaded or sent: never "unconfirmed".
    const attested = await input.onPreTransmissionPause(missing);
    return { ok: false, status: "needs_user_input", pendingQuestions: missing,
      error: attested
        ? `${missing.length} risposte richieste. Pausa verificata prima di inserire dati o allegati nel portale ${provider}.`
        : `${missing.length} risposte richieste. Nessun dato inserito nel portale; serve la tua approvazione per riprendere questa candidatura.` };
  }
  // Durable, one-way boundary before the first candidate data leaves this process.
  if (!input.beforeCandidateData || !await input.beforeCandidateData()) return { ok: false, status: "submission_unconfirmed", error: "Invio fermato dai controlli attuali prima di inserire dati nel portale." };
  return null;
}
