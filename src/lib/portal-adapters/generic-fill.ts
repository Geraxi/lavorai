import { candidateFacts, resolveCandidateFact, type FactContext } from "../candidate-facts";
import { questionKey, isAnnualEurExpectation, resolveScopedQuestionAnswer } from "./answer-safety";
import type { Page, Locator } from "playwright";
import {
  type ApplicationAnswers,
} from "@/lib/application-answers";

/** Fill only supplied answers with an exact, scope-preserving question match.
 * Unknown fields remain empty; dropdown labels must match exactly.
 */
export async function fillCustomQuestions(
  page: Page,
  answers: ApplicationAnswers | undefined,
  options: { rootSelector?: string; context?: FactContext } = {},
): Promise<{ filled: number; matched: string[] }> {
  if (!answers && !options.context) return { filled: 0, matched: [] };
  const context = options.context ?? { facts: candidateFacts(null, {}, answers) };

  const root = options.rootSelector ?? "form, [data-form], main";
  const matched: string[] = [];
  let filled = 0;

  // 1. Inputs di tipo testo (text/url/number/email)
  const textInputs = await page
    .locator(
      `${root} input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"])`,
    )
    .all();
  for (const inp of textInputs) {
    if (!(await isVisibleAndEmpty(inp))) continue;
    const labelTxt = await readLabel(inp);
    const key = matchAnswerKey(labelTxt) ?? "fact";
    const v = resolveFillAnswer({ label: labelTxt, kind: "text" }, context);
    if (v == null) continue;
    try {
      await inp.fill(String(v));
      filled++;
      matched.push(`${key} → "${labelTxt.slice(0, 40)}"`);
    } catch {
      // ignore
    }
  }

  // 2. Textarea (whyInterested principalmente)
  const textareas = await page.locator(`${root} textarea`).all();
  for (const ta of textareas) {
    if (!(await isVisibleAndEmpty(ta))) continue;
    const labelTxt = await readLabel(ta);
    const key = matchAnswerKey(labelTxt) ?? "fact";
    const v = resolveFillAnswer({ label: labelTxt, kind: "text" }, context);
    if (typeof v !== "string" || !v.trim()) continue;
    try {
      await ta.fill(v);
      filled++;
      matched.push(`${key} → textarea "${labelTxt.slice(0, 40)}"`);
    } catch {
      // ignore
    }
  }

  // 3. Select (native <select>)
  const selects = await page.locator(`${root} select`).all();
  for (const sel of selects) {
    if (!(await sel.isVisible().catch(() => false))) continue;
    const cur = await sel.inputValue().catch(() => "");
    if (cur && cur.trim() !== "") continue; // già scelto
    const labelTxt = await readLabel(sel);
    const key = matchAnswerKey(labelTxt) ?? "fact";
    const labels = await sel.locator("option").allTextContents();
    const optionText = resolveFillAnswer({ label: labelTxt, kind: "select", options: labels }, context);
    if (!optionText) continue;
    try {
      await sel.selectOption({ label: optionText });
      filled++;
      matched.push(`${key} → select "${labelTxt.slice(0, 40)}" = ${optionText}`);
    } catch {
      // ignore
    }
  }

  return { filled, matched };
}

// ---------- helpers ----------
function resolveFillAnswer(field: { label: string; kind: string; options?: string[] }, context: FactContext) {
  const scoped = resolveScopedQuestionAnswer(context.storedAnswers, field);
  return scoped.conflict ? null : scoped.answer ?? resolveCandidateFact(field, context).answer;
}


async function isVisibleAndEmpty(loc: Locator): Promise<boolean> {
  if (!(await loc.isVisible().catch(() => false))) return false;
  const v = await loc.inputValue().catch(() => "");
  return !v || v.trim() === "";
}

/**
 * Usa la prima etichetta visibile, senza concatenare metadati alla domanda.
 */
async function readLabel(loc: Locator): Promise<string> {
  const parts: string[] = [];
  try {
    const id = await loc.getAttribute("id");
    if (id) {
      const label = await loc
        .page()
        .locator(`label[for="${cssEscape(id)}"]`)
        .first()
        .textContent({ timeout: 500 })
        .catch(() => null);
      if (label) parts.push(label);
    }
  } catch {
    // ignore
  }
  for (const attr of ["aria-label", "placeholder", "name", "id"]) {
    const v = await loc.getAttribute(attr).catch(() => null);
    if (v) parts.push(v);
  }
  return parts[0]?.trim() ?? "";
}

function cssEscape(s: string): string {
  return s.replace(/(["\\#.:[\]])/g, "\\$1");
}

export function matchAnswerKey(label: string): keyof ApplicationAnswers | null {
  const key = questionKey(label);
  if (isAnnualEurExpectation(label)) return "salaryExpectationEur";
  const mappings: Array<[RegExp, keyof ApplicationAnswers]> = [
    [/^(?:linkedin|linkedin url|linkedin profile|profilo linkedin)$/, "linkedinUrl"],
    [/^(?:github|github url|github profile)$/, "githubUrl"],
    [/^(?:portfolio|portfolio url)$/, "portfolioUrl"],
    [/^(?:website|personal website|sito web personale)$/, "websiteUrl"],
    [/^(?:city|current city|city of residence|città|citta|città di residenza)$/, "city"],
    [/^(?:country|current country|country of residence|paese|paese di residenza|nazione)$/, "country"],
    [/^(?:pronouns|pronoun|pronomi)$/, "pronouns"],
    [/^(?:notice period|preavviso|periodo di preavviso)$/, "noticePeriod"],
    [/^(?:are you willing to relocate|willing to relocate|disponibile a trasferirti)$/, "relocate"],
    [/^(?:how did you hear about us|where did you hear about us|come ci hai conosciuto)$/, "howHeard"],
    [/^(?:gender|genere)$/, "eeoGender"],
    [/^(?:veteran status|are you a veteran)$/, "eeoVeteran"],
    [/^(?:disability status|do you have a disability)$/, "eeoDisability"],
    [/^(?:why are you interested in this role|why this role|perché sei interessato a questo ruolo|motivazione)$/, "whyInterested"],
  ];
  // No country-specific authorization/sponsorship answer can be derived from
  // the coarse workAuthEU setting. The exact user answer must be requested.
  return mappings.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}
