import { randomBytes } from "node:crypto";

/** Visible ATS labels only. Lever dumps `cards[...]` names and autocomplete
 * option lists into the first nearby text node; those are not questions. */
export function looksLikeAutocompleteNoise(label: string): boolean {
  const text = label.replace(/\s+/g, " ").trim();
  if (text.length > 180) return true;
  if (/\+\d{1,4}[A-Z]/.test(text) && text.length > 40) return true;
  if (/(united states|united kingdom|afghanistan).{10,}(albania|algeria|united kingdom|united states)/i.test(text)) return true;
  return false;
}

/** Workable custom fields are named CA_33134 / QA_12784602. Those are not questions. */
export function isInternalAtsFieldName(label: string): boolean {
  return /^(?:CA|QA|HA)_\d+$/i.test(label.trim());
}

export function sanitizeFormLabel(label: string): string {
  let text = label
    .replace(/SVGs? not supported by this browser\.?/gi, " ")
    .split(/\s*\+\d{1,4}[A-Z]/)[0]
    .replace(/\s+/g, " ")
    .trim();
  if (/^cards?\[[^\]]*\]/i.test(text)) return "";
  if (isInternalAtsFieldName(text)) return "";
  if (looksLikeAutocompleteNoise(text)) {
    text = text.split(/\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
    if (looksLikeAutocompleteNoise(text) || /^cards?\[[^\]]*\]/i.test(text) || isInternalAtsFieldName(text)) return "";
  }
  return text;
}

/**
 * Prefer a visible heading over an internal ATS name or a lone option ("YES").
 * `walkedText` is the best container heading the collector already found.
 */
export function preferVisibleQuestionLabel(params: {
  name?: string | null;
  visibleText?: string | null;
  options?: string[];
  fallback: string;
}): string {
  const options = (params.options ?? []).map((option) => option.trim()).filter(Boolean);
  const isOptionOnly = (value: string) =>
    options.some((option) => option.toLowerCase() === value.toLowerCase())
    || /^(yes|no|y|n|si|sì|true|false|1|0)$/i.test(value);
  const usable = (value: string | null | undefined) => {
    const text = sanitizeFormLabel(value ?? "");
    if (!text || isInternalAtsFieldName(text) || isOptionOnly(text)) return "";
    if (params.name && text === params.name.trim()) return "";
    return text;
  };
  return usable(params.visibleText) || params.fallback;
}

export function canaryScreenshotFilename(label = "post-submit"): string {
  const token = randomBytes(16).toString("hex");
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "shot";
  return `canary/${token}-${safe}.png`;
}
