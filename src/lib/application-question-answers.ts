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
  const key = normalizeQuestionLabel(input.label);
  return /^(first name|given name|nome|last name|family name|surname|cognome|full name|nome e cognome|email|e mail|email address|indirizzo email|phone|phone number|telephone|mobile|telefono|numero di telefono|cellulare|city|current city|city of residence|current location|citt|citta|citt di residenza|citta di residenza|where do you live|where are you based|dove vivi|dove risiedi|current employer|current company|azienda attuale|datore di lavoro attuale|current or previous employer|most recent employer|last employer|ultima azienda|current job title|current position|ruolo attuale|posizione attuale|current or previous job title|most recent job title|last job title|most recent school|most recent university|ultima universit|ultima universita|linkedin|linkedin url|linkedin profile|profilo linkedin|portfolio|portfolio url|personal website|sito web personale|years of experience|years of professional experience|how many years of professional experience do you have|anni di esperienza|anni di esperienza professionale|quanti anni di esperienza professionale hai|english level|level of english|english proficiency|livello di inglese|highest education|highest level of education|titolo di studio|titolo di studio pi alto)$/.test(key);
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
export function matchingExplicitApplicationAnswer(json: string | null | undefined, applicationId: string, question: ApplicationQuestion): ExplicitApplicationAnswer | null {
  const fingerprint = questionFingerprint(question);
  return parseExplicitApplicationAnswers(json, applicationId).find(answer => answer.fingerprint === fingerprint) ?? null;
}

/** Worker/adapter contract: retain fingerprint and options through to field fill. */
export const parseScopedApplicationAnswers = parseExplicitApplicationAnswers;
