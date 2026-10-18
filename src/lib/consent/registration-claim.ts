/**
 * Client side of the one-shot registration conversion.
 *
 * The server creates one RegistrationConversion row (with an opaque event ID)
 * at confirmed account creation. The first authenticated page view after that
 * claims it ONCE, stating whether advertising consent is effective right now.
 * The server marks it consumed in the same step, so:
 *   - reloads, rerenders, auth retries and later visits get nothing back;
 *   - a registration made without ad consent is never replayed after a later
 *     acceptance (the claim already consumed it as "blocked").
 * A localStorage key per event ID is a second guard against double sends.
 */

export const REGISTRATION_CLAIM_PATH = "/api/tracking/registration";
export const SENT_KEY_PREFIX = "lavorai-reg-sent:";
export const CLAIMED_SESSION_PREFIX = "lavorai-reg-claimed:";

interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export interface ClaimDeps {
  userId: string;
  advertisingAllowed: () => boolean;
  post: (path: string, body: unknown) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  local: KV | null;
  session: KV | null;
  send: (eventId: string) => boolean;
}

export type ClaimResult = "skipped_session" | "network_error" | "no_event" | "duplicate" | "blocked" | "sent";

export async function claimAndSendRegistration(deps: ClaimDeps): Promise<ClaimResult> {
  const sessionKey = CLAIMED_SESSION_PREFIX + deps.userId;
  try {
    if (deps.session?.getItem(sessionKey)) return "skipped_session";
  } catch { /* storage blocked */ }

  const advertising = deps.advertisingAllowed();
  let eventId: string | null = null;
  try {
    const res = await deps.post(REGISTRATION_CLAIM_PATH, { advertising });
    if (!res.ok) return "network_error";
    const body = (await res.json()) as { eventId?: unknown };
    eventId = typeof body?.eventId === "string" ? body.eventId : null;
  } catch {
    return "network_error";
  }
  try { deps.session?.setItem(sessionKey, "1"); } catch { /* storage blocked */ }
  if (!eventId) return "no_event";

  const sentKey = SENT_KEY_PREFIX + eventId;
  try {
    if (deps.local?.getItem(sentKey)) return "duplicate";
  } catch { /* storage blocked */ }
  // Re-check right before the event: consent may have been withdrawn meanwhile.
  if (!deps.advertisingAllowed()) return "blocked";
  try { deps.local?.setItem(sentKey, new Date().toISOString()); } catch { /* storage blocked */ }
  return deps.send(eventId) ? "sent" : "blocked";
}
