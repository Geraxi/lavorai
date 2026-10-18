import { randomUUID } from "node:crypto";

/**
 * Server side of the one-shot Meta CompleteRegistration event.
 *
 * Created ONLY where a brand-new User row is created:
 *   - /api/auth/signup (email + password; the account exists before email
 *     verification because of soft verification, so creation is the measured
 *     moment), method "password";
 *   - Auth.js `events.createUser` (adapter creation: first Google sign-in, or
 *     a first magic-link sign-in), method "google" / "magic_link".
 * Returning logins never create a row, so they can never emit the event.
 *
 * The opaque eventId (random UUID, unrelated to the user id or email) is the
 * Meta `eventID` used for deduplication.
 */

export const REGISTRATION_CLAIM_WINDOW_MS = 30 * 60 * 1000;

export type RegistrationMethod = "password" | "google" | "magic_link";
export type RegistrationOutcome = "released" | "blocked_no_consent" | "expired";

interface RegistrationConversionDelegate {
  create(args: { data: { userId: string; eventId: string; method: string }; select: { id: true } }): Promise<{ id: string }>;
  findUnique(args: { where: { userId: string }; select: { id: true; eventId: true; createdAt: true; claimedAt: true } }): Promise<{ id: string; eventId: string; createdAt: Date; claimedAt: Date | null } | null>;
  updateMany(args: { where: { id: string; claimedAt: null }; data: { claimedAt: Date; outcome: RegistrationOutcome } }): Promise<{ count: number }>;
}

export interface RegistrationPrisma {
  registrationConversion: RegistrationConversionDelegate;
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "unknown";
}

/** Best-effort: never breaks account creation. */
export async function createRegistrationConversion(
  prisma: RegistrationPrisma,
  userId: string,
  method: RegistrationMethod,
): Promise<boolean> {
  try {
    await prisma.registrationConversion.create({
      data: { userId, eventId: randomUUID(), method },
      select: { id: true },
    });
    return true;
  } catch (error) {
    console.warn("[registration-conversion] create failed", { code: errorCode(error), method });
    return false;
  }
}

/**
 * Consumes the user's registration event exactly once. Returns the eventId
 * only when the claim is the first, within the window, AND advertising consent
 * was effective at claim time. Every other first claim still consumes the row.
 */
export async function claimRegistrationConversion(
  prisma: RegistrationPrisma,
  userId: string,
  advertising: boolean,
  now: Date = new Date(),
): Promise<{ eventId: string | null; outcome: RegistrationOutcome | "none" | "already_claimed" | "race_lost" }> {
  const row = await prisma.registrationConversion.findUnique({
    where: { userId },
    select: { id: true, eventId: true, createdAt: true, claimedAt: true },
  });
  if (!row) return { eventId: null, outcome: "none" };
  if (row.claimedAt) return { eventId: null, outcome: "already_claimed" };
  const expired = now.getTime() - row.createdAt.getTime() > REGISTRATION_CLAIM_WINDOW_MS;
  const outcome: RegistrationOutcome = expired ? "expired" : advertising ? "released" : "blocked_no_consent";
  const result = await prisma.registrationConversion.updateMany({
    where: { id: row.id, claimedAt: null },
    data: { claimedAt: now, outcome },
  });
  if (result.count !== 1) return { eventId: null, outcome: "race_lost" };
  return { eventId: outcome === "released" ? row.eventId : null, outcome };
}
