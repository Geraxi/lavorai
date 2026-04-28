import type { Page, Locator } from "playwright";
import {
  FIELD_HINTS,
  NOTICE_LABEL,
  WORK_AUTH_LABEL,
  HOW_HEARD_LABEL,
  type ApplicationAnswers,
} from "@/lib/application-answers";

/**
 * Best-effort fill di campi custom delle form ATS.
 *
 * Strategia: per ogni input/select/textarea visibile non già compilato,
 * leggiamo l'etichetta (label associata, aria-label, placeholder, name).
 * Fuzzy-match contro FIELD_HINTS per scoprire quale ApplicationAnswers
 * key corrisponde, e compiliamo.
 *
 * Per i select: cerchiamo l'opzione il cui testo matcha la nostra
 * answer (es. "yes_eu_citizen" → opzione che contiene "yes" / "eu").
 *
 * Best-effort = se non sappiamo cosa fare, lasciamo vuoto. Mai
 * inventare risposte sbagliate (es. dichiarare di essere veterano).
 */
export async function fillCustomQuestions(
  page: Page,
  answers: ApplicationAnswers | undefined,
  options: { rootSelector?: string } = {},
): Promise<{ filled: number; matched: string[] }> {
  if (!answers) return { filled: 0, matched: [] };

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
    const key = matchAnswerKey(labelTxt);
    if (!key) continue;
    const v = renderValueForText(key, answers);
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
    const key = matchAnswerKey(labelTxt);
    if (!key) continue;
    const v = renderValueForText(key, answers);
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
    const key = matchAnswerKey(labelTxt);
    if (!key) continue;
    const targetText = renderValueForSelect(key, answers);
    if (!targetText) continue;
    const optionText = await pickBestOptionText(sel, targetText);
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

async function isVisibleAndEmpty(loc: Locator): Promise<boolean> {
  if (!(await loc.isVisible().catch(() => false))) return false;
  const v = await loc.inputValue().catch(() => "");
  return !v || v.trim() === "";
}

/**
 * Estrae label associato + aria-label + placeholder + name in un'unica
 * stringa lowercase per il match.
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
  return parts.join(" | ").toLowerCase();
}

function cssEscape(s: string): string {
  return s.replace(/(["\\#.:[\]])/g, "\\$1");
}

/**
 * Trova la chiave ApplicationAnswers che meglio matcha l'etichetta.
 * Restituisce la chiave più specifica (più long pattern wins).
 */
function matchAnswerKey(label: string): keyof ApplicationAnswers | null {
  if (!label) return null;
  let bestKey: keyof ApplicationAnswers | null = null;
  let bestLen = 0;
  for (const [key, hints] of Object.entries(FIELD_HINTS) as [
    keyof ApplicationAnswers,
    string[],
  ][]) {
    for (const h of hints) {
      if (label.includes(h) && h.length > bestLen) {
        bestKey = key;
        bestLen = h.length;
      }
    }
  }
  return bestKey;
}

function renderValueForText(
  key: keyof ApplicationAnswers,
  a: ApplicationAnswers,
): string | number | null {
  switch (key) {
    case "salaryExpectationEur":
      return a.salaryExpectationEur ?? null;
    case "linkedinUrl":
      return a.linkedinUrl ?? null;
    case "githubUrl":
      return a.githubUrl ?? null;
    case "whyInterested":
      return a.whyInterested ?? null;
    default:
      return null;
  }
}

function renderValueForSelect(
  key: keyof ApplicationAnswers,
  a: ApplicationAnswers,
): string | null {
  switch (key) {
    case "workAuthEU":
      return a.workAuthEU
        ? selectKeyword(a.workAuthEU)
        : null;
    case "noticePeriod":
      return a.noticePeriod ? NOTICE_LABEL[a.noticePeriod] : null;
    case "relocate":
      return a.relocate === undefined
        ? null
        : a.relocate
          ? "yes"
          : "no";
    case "howHeard":
      return a.howHeard ? HOW_HEARD_LABEL[a.howHeard] : null;
    case "eeoGender":
      return a.eeoGender
        ? a.eeoGender === "prefer_not"
          ? "prefer not"
          : a.eeoGender === "non_binary"
            ? "non-binary"
            : a.eeoGender
        : null;
    case "eeoVeteran":
      return a.eeoVeteran === "prefer_not"
        ? "prefer not"
        : a.eeoVeteran ?? null;
    case "eeoDisability":
      return a.eeoDisability === "prefer_not"
        ? "prefer not"
        : a.eeoDisability ?? null;
    default:
      return null;
  }
}

function selectKeyword(workAuth: NonNullable<ApplicationAnswers["workAuthEU"]>): string {
  if (workAuth === "yes_eu_citizen") return "yes";
  if (workAuth === "yes_permit") return "yes";
  if (workAuth === "no_needs_sponsorship") return "no";
  // safety
  return WORK_AUTH_LABEL[workAuth] ?? "";
}

/**
 * Tra le opzioni di un <select>, ritorna il testo dell'opzione il cui
 * label contiene la nostra "target answer" (case-insensitive).
 */
async function pickBestOptionText(
  sel: Locator,
  target: string,
): Promise<string | null> {
  const targetLower = target.toLowerCase();
  const opts = await sel.locator("option").all();
  let best: string | null = null;
  let bestScore = 0;
  for (const o of opts) {
    const txt = (await o.textContent().catch(() => null))?.trim() ?? "";
    if (!txt || txt.toLowerCase().includes("select") || txt === "") continue;
    if (txt.toLowerCase().includes(targetLower)) {
      const score = targetLower.length;
      if (score > bestScore) {
        bestScore = score;
        best = txt;
      }
    }
  }
  return best;
}
