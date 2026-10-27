/** No Google sign-in grant is treated as permission to read mail. */
export const GMAIL_READ_SCOPES = new Set([
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://mail.google.com/",
]);
export type GmailFailure = "signin_only" | "reconnect_required" | "server_configuration" | "temporary" | "deadline" | "cursor_invalid";
export class GmailSyncError extends Error {
  constructor(public readonly code: GmailFailure) { super(code); }
}
export function gmailConnectionState(account: { scope: string | null; access_token: string | null; refresh_token: string | null; expires_at: number | null }, now = Date.now()): "ready" | "signin_only" | "reconnect_required" {
  if (!account.scope?.split(/\s+/).some(scope => GMAIL_READ_SCOPES.has(scope))) return "signin_only";
  if (account.refresh_token || (account.access_token && account.expires_at && account.expires_at * 1000 > now + 60_000)) return "ready";
  return "reconnect_required";
}
export function refreshFailure(status: number, code: unknown): GmailFailure {
  if (code === "invalid_grant") return "reconnect_required";
  if (code === "invalid_client" || code === "unauthorized_client") return "server_configuration";
  // A generic 400 is not proof that the owner's grant was revoked.
  return "temporary";
}
export function gmailRequestSignal(deadline: number): AbortSignal {
  const remaining = deadline - Date.now();
  if (remaining < 1_000) throw new GmailSyncError("deadline");
  return AbortSignal.timeout(Math.min(10_000, remaining));
}
