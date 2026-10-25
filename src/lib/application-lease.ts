import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

/** How long a worker may hold a row without renewing. Recovery may reclaim only after this. */
export const APPLICATION_LEASE_MS = 10 * 60_000;

export type ApplicationWorkLease = Date & { leaseToken: string };

export function asWorkLease(startedAt: Date, leaseToken: string): ApplicationWorkLease {
  const token = new Date(+startedAt) as ApplicationWorkLease;
  token.leaseToken = leaseToken;
  return token;
}

export function leaseTokenOf(token: Date | ApplicationWorkLease | null | undefined): string | null {
  if (!token || typeof token !== "object") return null;
  const value = (token as ApplicationWorkLease).leaseToken;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function issueApplicationLease(now = new Date()): {
  startedAt: Date;
  leaseToken: string;
  leaseExpiresAt: Date;
} {
  return {
    startedAt: now,
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(+now + APPLICATION_LEASE_MS),
  };
}

export function asIssuedWorkLease(issued: { startedAt: Date; leaseToken: string }): ApplicationWorkLease {
  return asWorkLease(issued.startedAt, issued.leaseToken);
}

/** Prisma where: this worker still owns the row and the lease has not expired. */
export function liveLeaseFields(token: Date | ApplicationWorkLease, now = new Date()): {
  startedAt: Date;
  leaseToken: string;
  leaseExpiresAt: { gt: Date };
} {
  const leaseToken = leaseTokenOf(token);
  if (!leaseToken) throw new Error("application_lease_missing");
  return { startedAt: token, leaseToken, leaseExpiresAt: { gt: now } };
}

export function liveLeaseWhere(
  id: string,
  token: Date | ApplicationWorkLease,
  extra: Prisma.ApplicationWhereInput = {},
  now = new Date(),
): Prisma.ApplicationWhereInput {
  return { id, ...liveLeaseFields(token, now), ...extra };
}

/** Rows whose claim/lease may be reclaimed. Pre-lease startedAt rows count as expired. */
export function expiredLeaseWhere(now = new Date()): Prisma.ApplicationWhereInput {
  return {
    completedAt: null,
    OR: [
      { leaseExpiresAt: { lte: now } },
      { leaseExpiresAt: null, startedAt: { not: null } },
    ],
  };
}

export function renewLeaseData(now = new Date()): { leaseExpiresAt: Date } {
  return { leaseExpiresAt: new Date(+now + APPLICATION_LEASE_MS) };
}
