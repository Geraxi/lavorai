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

export function sanitizeFormLabel(label: string): string {
  let text = label
    .replace(/SVGs? not supported by this browser\.?/gi, " ")
    .split(/\s*\+\d{1,4}[A-Z]/)[0]
    .replace(/\s+/g, " ")
    .trim();
  if (/^cards?\[[^\]]*\]/i.test(text)) return "";
  if (looksLikeAutocompleteNoise(text)) {
    text = text.split(/\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
    if (looksLikeAutocompleteNoise(text) || /^cards?\[[^\]]*\]/i.test(text)) return "";
  }
  return text;
}

export function canaryScreenshotFilename(label = "post-submit"): string {
  const token = randomBytes(16).toString("hex");
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "shot";
  return `canary/${token}-${safe}.png`;
}
