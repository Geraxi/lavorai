/** OTP / verification-code and link extraction from inbound mail. Pure. */
import { extractApplicationSecurityCode } from "@/lib/application-security-code";

const LABEL = /(?:verification|security|confirmation|one[- ]time|access)\s*(?:code|pin)|\bOTP\b|\bPIN\b|\bcode\b|codice(?:\s+(?:di\s+)?(?:verifica|sicurezza|conferma|accesso|OTP))?/i;

/** Labelled codes only: never arbitrary numbers (job ids, dates, phone numbers). */
export function extractCodes(text: string): string[] {
  const codes = new Set<string>();
  const known = extractApplicationSecurityCode(text);
  if (known) codes.add(known);
  const re = new RegExp(`(?:${LABEL.source})\\s*(?:is|è|:|-|=)?\\s*(?:is|è)?\\s*[:\\-]?\\s*([A-Z0-9]{4,10}|\\d{3}[ -]\\d{3})\\b`, "gi");
  for (const m of text.matchAll(re)) {
    const c = m[1].replace(/[ -]/g, "");
    // A real code contains a digit (excludes words like "BELOW", "CANDIDATO").
    if (/\d/.test(c) && !/^(19|20)\d{2}$/.test(c)) codes.add(c);
  }
  return [...codes].slice(0, 5);
}

export interface ExtractedLink { url: string; kind: "verification" | "other" }

export function extractLinks(text: string, html?: string | null): ExtractedLink[] {
  const urls = new Set<string>();
  for (const m of (html ?? "").matchAll(/href\s*=\s*["'](https:\/\/[^"'\s<>]+)["']/gi)) urls.add(m[1].replace(/&amp;/g, "&"));
  for (const m of text.matchAll(/https:\/\/[^\s<>"')\]]+/gi)) urls.add(m[0].replace(/[.,;:!?]+$/, ""));
  return [...urls].filter((u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } }).slice(0, 20).map((url) => ({
    url: url.slice(0, 1000),
    kind: /verif|confirm|conferma|activate|attiva|validate|token=|magic|complete[-_]?(your[-_]?)?application|completa/i.test(url) ? "verification" : "other",
  }));
}
