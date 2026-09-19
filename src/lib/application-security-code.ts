/** Only Greenhouse verification messages are consumed by the automated flow. */
export function isGreenhouseSecurityMessage(input: {
  fromAddress: string;
  subject?: string | null;
  bodyText?: string | null;
}): boolean {
  const address = input.fromAddress.match(/<?([^\s<>]+@[^\s<>]+)>?/)?.[1] ?? "";
  // Real OTP mail comes from no-reply@us.greenhouse-mail.io (and similar),
  // not only @greenhouse.io — the old regex rejected those and left applies
  // stuck waiting for a code that was already in ApplicationReply.
  const fromGreenhouse =
    /@(?:[a-z0-9-]+\.)*(?:greenhouse\.io|greenhouse-mail\.io)$/i.test(address);
  const mentionsCode =
    /\b(security code|verification code|codice di (?:sicurezza|verifica))\b/i.test(
      `${input.subject ?? ""}\n${input.bodyText ?? ""}`,
    );
  return fromGreenhouse && mentionsCode;
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
    /\/(?:thank[-_]?you|confirmation|success)(?:[\/?#]|$)/i.test(url);
}
