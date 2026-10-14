import { resolveScopedQuestionAnswer } from "../application-question-answers";

/** Normalize a question without discarding its factual scope (country, skill, units). */
export function questionKey(label: string): string {
  return label.toLowerCase().replace(/[?*:]/g, "").replace(/[.]$/, "").replace(/\s+/g, " ").trim()
    .replace(/^(?:what is|please enter|please provide|enter|provide) (?:your )?/, "").replace(/^your /, "");
}
export function exactOption(options: string[] | undefined, answer: string): string | null {
  const key = answer.trim().toLowerCase();
  return options?.find((option) => option.trim().toLowerCase() === key) ?? null;
}
export function isTotalExperienceQuestion(label: string): boolean {
  return /^(?:years of (?:professional |total )?experience|total years of (?:professional )?experience|how many years of (?:professional )?experience do you have|anni di esperienza(?: professionale)?|quanti anni di esperienza(?: professionale)? hai)$/.test(questionKey(label));
}
export function isAnnualEurExpectation(label: string): boolean {
  const question = questionKey(label);
  return /^(?:expected|desired) annual (?:salary|compensation)\s*\(?\s*(?:eur|€|euros?)\s*\)?$/.test(question) ||
    /^(?:annual (?:salary|compensation) (?:expectation|expectations)\s*\(?\s*(?:eur|€|euros?)\s*\)?|ral desiderata|ral attesa|aspettativa ral|aspettativa di ral)$/.test(question);
}
export function isNarrativeQuestion(label: string, kind: string): boolean {
  if (kind !== "text" && kind !== "textarea") return false;
  const key = questionKey(label);
  // AI can compose a CV-grounded narrative, never decide a factual screening
  // answer, estimate a number or make a new commitment for the applicant.
  if (/years?|anni|authori[sz]|eligib|visa|sponsor|permit|citizen|residen|salary|compensation|retribuz|stipend|notice|preavviso|available|disponib|relocat|trasfer|clearance|criminal|convict|licen[sc]|certif|degree|diploma|age|\b18\b|consent|agree|terms|privacy|reference|referenz/.test(key)) return false;
  return /^(?:tell us about yourself|tell me about yourself|introduce yourself|personal (?:summary|statement)|cover letter|lettera (?:di presentazione|motivazionale)|parlaci di te|presentati|why (?:are you interested|do you want to work|this (?:role|company))|perch[ée] (?:sei interessat|vuoi lavorare|quest[ao] (?:ruolo|azienda))|motivation(?:al statement)?|motivazione)/.test(key);
}

/** The worker verifies the application's envelope. At the form boundary,
 * verify the exact declaration and choices again: a matching global label
 * never authorizes a checkbox or an employer-specific factual answer. */
export function matchingScopedAnswer(
  stored: Array<{ label: string; answer: string; kind?: string; options?: string[]; fingerprint?: string }> | undefined,
  field: { label: string; kind: string; options?: string[] },
): string | null {
  return resolveScopedQuestionAnswer(stored, field).answer;
}
export { resolveScopedQuestionAnswer };
