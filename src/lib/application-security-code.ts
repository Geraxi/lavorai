/** Only Greenhouse verification messages are consumed by the automated flow. */
export function isGreenhouseSecurityMessage(input: {
  fromAddress: string;
  subject?: string | null;
  bodyText?: string | null;
}): boolean {
  const address = input.fromAddress.match(/<?([^\s<>]+@[^\s<>]+)>?/)?.[1] ?? "";
  return /@(?:[a-z0-9-]+\.)*greenhouse\.io$/i.test(address) &&
    /\b(security code|verification code|codice di (?:sicurezza|verifica))\b/i.test(`${input.subject ?? ""}\n${input.bodyText ?? ""}`);
}

export function extractApplicationSecurityCode(text: string): string | null {
  // Anchor to the code's label; never pick arbitrary numbers from the subject
  // (job IDs), dates or ordinary eight-letter words from the email.
  const labeled = text.match(/(?:copy and paste this code|(?:security|verification) code|codice di (?:sicurezza|verifica))[^:\n]{0,100}:\s*([A-Za-z0-9]{6,12})\b/i);
  if (labeled) return labeled[1];
  return text.match(/(?:copy and paste this code|(?:security|verification) code|codice di (?:sicurezza|verifica))\s*(?:(?:is|è)\s+)?\s*([A-Za-z0-9]{6,12})\b(?=\s*(?:[.!]|$|After you enter|Dopo))/i)?.[1] ?? null;
}

export const SECURITY_CODE_FIELD = 'input[name*="security" i]:visible, input[id*="security" i]:visible, input[autocomplete="one-time-code"]:visible, input[name="code" i]:visible, input[name*="verification" i]:visible';

export function hasApplicationConfirmation(text: string, url: string): boolean {
  return /\b(application (?:has been )?(?:received|submitted|successful)|we (?:have )?received your application|candidatura (?:inviata|ricevuta))\b/i.test(text) ||
    /\/(?:thank[-_]?you|confirmation|success)(?:[/?#]|$)/i.test(url);
}
