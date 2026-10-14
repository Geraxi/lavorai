import { isGreenhouseSecurityMessage } from "@/lib/application-security-code";

/** Technical challenges stay available to application workers, never exposed as
 * recruiter responses. Require automated sender context or an actual OTP token
 * so a recruiter discussing verification is not silently hidden.
 */
export function isApplicationVerificationMessage(input: {
  fromAddress: string;
  subject?: string | null;
  bodyText?: string | null;
}): boolean {
  // A delivery failure quoting an OTP subject is still a failure the user
  // should be able to inspect, not an active security challenge.
  if (/mailer-daemon|postmaster@/i.test(input.fromAddress) ||
    /delivery status notification|undeliverable|mail delivery failed|returned mail|failure notice|mancata consegna|messaggio non recapitato/i.test(input.subject ?? "")) return false;
  if (isGreenhouseSecurityMessage(input)) return true;
  const text = `${input.subject ?? ""}\n${input.bodyText ?? ""}`;
  if (!/\b(security code|verification code|one[- ]time (?:code|password)|codice (?:di (?:sicurezza|verifica)|monouso))\b/i.test(text)) return false;
  const sender = input.fromAddress.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? "";
  const automatedSender = /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|security|verification|verify|otp|automated|notifications?)(?:[+._-][^@]*)?@/i.test(sender);
  if (automatedSender) return true;
  // Real token anchored to a code label, with a digit or uppercase-only code.
  const token = text.match(/(?:security code|verification code|one[- ]time (?:code|password)|codice (?:di (?:sicurezza|verifica)|monouso))\s*(?::|\bis\b|\bè\b)?\s*([A-Za-z0-9]{4,12})\b/i)?.[1];
  return !!token && (/\d/.test(token) || /^[A-Z]{6,12}$/.test(token));
}
