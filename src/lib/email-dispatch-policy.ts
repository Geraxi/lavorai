export const EMAIL_RETRY_WINDOW_MS = 23 * 60 * 60_000;
export const EMAIL_MAX_ATTEMPTS = 5;
export const EMAIL_LEASE_MS = 60_000;
export const EMAIL_REQUEST_TIMEOUT_MS = 15_000;
export const EMAIL_SPACING_MS = 250;
export function emailBackoff(attempt: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}
export function essentialEmail(kind: string): boolean {
  return ["signup_verify", "password_reset", "magic_link", "payment_failed", "cv_ready", "application_sent", "application_manual", "trial_started", "trial_granted", "other", "release_canary"].includes(kind);
}
export class EmailDispatchError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly deferred = false, readonly reviewRequired = false) { super(message); }
}
export function providerFailure(error: { statusCode?: number | null; name?: string } | null | undefined) {
  if (error?.name === "invalid_idempotent_request") return new EmailDispatchError("invalid_idempotent_request", false, false, true);
  const status = error?.statusCode;
  return new EmailDispatchError(error?.name ?? "missing_provider_id",
    !status || status === 408 || status === 409 || status === 429 || status >= 500);
}
