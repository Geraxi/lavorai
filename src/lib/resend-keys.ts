/**
 * Resend credential accessors. Never log the return values.
 *
 * RESEND_API_KEY is the sending key (can become sending-only for lavorai.it
 * after the receiving key is live). RESEND_RECEIVING_API_KEY is for inbound
 * body fetch. Until the receiving key is configured, receiving callers fall
 * back to RESEND_API_KEY.
 */
export function resendSendingApiKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const key = env.RESEND_API_KEY?.trim();
  return key || undefined;
}

export function resendReceivingApiKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const receiving = env.RESEND_RECEIVING_API_KEY?.trim();
  if (receiving) return receiving;
  return resendSendingApiKey(env);
}

/** Strip credential material from provider text. Never log raw keys. */
export function scrubResendSecretText(value: string): string {
  return value
    .replace(/re_[A-Za-z0-9]+/g, "re_[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

export function redactEmailAddress(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return "[redacted]";
  return `${trimmed[0]}***@${trimmed.slice(at + 1)}`;
}
