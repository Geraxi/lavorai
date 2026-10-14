import { reusableFactKey } from "./candidate-facts";
import { createHash } from "node:crypto";

export type ApplicationQuestion = { label: string; kind: string; options: string[] };
export type ExplicitApplicationAnswer = ApplicationQuestion & {
  fingerprint: string; answer: string; source: "user"; answeredAt: string;
};
export function normalizeQuestionLabel(label: string): string {
  return label.toLowerCase().replace(/[*]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
}
export function parseApplicationQuestion(value: unknown): ApplicationQuestion | null {
  if (!value || typeof value !== "object") return null;
  const question = value as Record<string, unknown>;
  if (typeof question.label !== "string" || normalizeQuestionLabel(question.label).length < 3) return null;
  const kind = typeof question.kind === "string" ? question.kind : "text";
  if (!["text", "textarea", "select", "react-select", "radio", "checkbox"].includes(kind)) return null;
  const options = Array.isArray(question.options)
    ? question.options.filter((option): option is string => typeof option === "string" && Boolean(option.trim())) : [];
  return { label: question.label.trim(), kind, options };
}
export function questionFingerprint(question: ApplicationQuestion): string {
  // Include exact displayed wording and options, not just the lossy normalized
  // key. A changed declaration or option set needs a new explicit answer.
  return createHash("sha256").update(JSON.stringify([question.label, question.kind, question.options])).digest("hex");
}
export function permitsQuestionAnswer(question: ApplicationQuestion, answer: string): boolean {
  if (!answer.trim() || answer.length > 2000) return false;
  if (question.kind === "checkbox") return ["Yes", "No"].includes(answer);
  if (["select", "react-select", "radio"].includes(question.kind)) return question.options.length > 0 && question.options.includes(answer);
  return true;
}
export function completesApplicationQuestion(question: ApplicationQuestion, answer: string): boolean {
  return permitsQuestionAnswer(question, answer) && (question.kind !== "checkbox" || answer === "Yes");
}

/** Only direct profile facts may be reused globally. Generic agreements,
 * declarations, legal eligibility and employer-specific choices always need
 * an answer for the exact application, even if an older global answer exists. */
export function isReusableProfileQuestion(input: { label: string; kind?: string }): boolean {
  if (input.kind === "checkbox") return false;
  return reusableFactKey(input.label) !== null;
}

export function parseExplicitApplicationAnswers(json: string | null | undefined, applicationId: string): ExplicitApplicationAnswer[] {
  if (!json || json.length > 1_000_000) return [];
  try {
    const record = JSON.parse(json);
    if (record?.version !== 1 || record.applicationId !== applicationId || !Array.isArray(record.answers) || record.answers.length > 100) return [];
    const answers: ExplicitApplicationAnswer[] = [];
    for (const value of record.answers) {
      const question = parseApplicationQuestion(value);
      if (!question || value.source !== "user" || typeof value.answer !== "string" || !permitsQuestionAnswer(question, value.answer)
        || value.fingerprint !== questionFingerprint(question) || typeof value.answeredAt !== "string" || !Number.isFinite(Date.parse(value.answeredAt))) continue;
      answers.push({ ...question, fingerprint: value.fingerprint, answer: value.answer, source: "user", answeredAt: value.answeredAt });
    }
    return answers;
  } catch { return []; }
}
export function encodeExplicitApplicationAnswers(applicationId: string, answers: ExplicitApplicationAnswer[]): string {
  return JSON.stringify({ version: 1, applicationId, answers });
}
export function resolveScopedQuestionAnswer(
  stored: Array<{ label: string; answer: string; kind?: string; options?: string[]; fingerprint?: string }> | undefined,
  field: { label: string; kind: string; options?: string[] },
): { answer: string | null; conflict: boolean } {
  const question = { label: field.label.trim(), kind: field.kind, options: field.options ?? [] };
  const fingerprint = questionFingerprint(question);
  const matches = (stored ?? []).filter(answer => answer.fingerprint === fingerprint && answer.kind
    && questionFingerprint({ label: answer.label.trim(), kind: answer.kind, options: answer.options ?? [] }) === fingerprint
    && permitsQuestionAnswer(question, answer.answer));
  const values = new Set(matches.map(answer => answer.answer));
  return { answer: values.size === 1 ? matches[0].answer : null, conflict: values.size > 1 };
}
export function resolveExplicitApplicationAnswer(json: string | null | undefined, applicationId: string, question: ApplicationQuestion) {
  return resolveScopedQuestionAnswer(parseExplicitApplicationAnswers(json, applicationId), question);
}
export function matchingExplicitApplicationAnswer(json: string | null | undefined, applicationId: string, question: ApplicationQuestion): ExplicitApplicationAnswer | null {
  const resolved = resolveExplicitApplicationAnswer(json, applicationId, question);
  return resolved.answer === null ? null : parseExplicitApplicationAnswers(json, applicationId).find(answer => answer.fingerprint === questionFingerprint(question) && answer.answer === resolved.answer) ?? null;
}

/** Worker/adapter contract: retain fingerprint and options through to field fill. */
export const parseScopedApplicationAnswers = parseExplicitApplicationAnswers;
