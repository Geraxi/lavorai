/**
 * First activation: an explicit allowlist of at most 5 application ids,
 * enforced in the database. Process memory is not a budget.
 *
 *   APPLICATION_RECOVERY_RELEASE=off          default: hold everything
 *   APPLICATION_RECOVERY_RELEASE=id1,id2      allow only these ids (≤5)
 *   APPLICATION_RECOVERY_RELEASE_IDS=id1,id2  extra allowlist (combined ≤5)
 *
 * `APPLICATION_RECOVERY_RELEASE=on` without ids releases nothing.
 * `APPLICATION_RECOVERY_RELEASE_CAP` is not a global cap and is ignored.
 *
 * Concurrency: unique ApplicationReleaseGrant per id (never released twice)
 * plus a conditional increment on ApplicationReleaseBatch.usedCount, together
 * with the existing work lease on Application.
 */
import { prisma } from "@/lib/db";

export const ACTIVATION_RELEASE_BATCH_ID = "activation-1";
export const ACTIVATION_RELEASE_MAX = 5;
export const CONTROLLED_RELEASE_REASON = "controlled_release";
/** Keep in sync with heldMessage("controlled_release"). */
export const CONTROLLED_RELEASE_MESSAGE =
  "Invio in attesa: in attesa di rilascio controllato. Questa elaborazione non ha effettuato nuovi invii.";

export function controlledReleaseMessage(): string {
  return CONTROLLED_RELEASE_MESSAGE;
}

export function controlledReleaseHoldData(now = new Date()) {
  return {
    startedAt: now,
    leaseToken: null,
    leaseExpiresAt: null,
    errorMessage: controlledReleaseMessage(),
  };
}

function parseIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** Explicit allowlist only. More than 5 configured ids fail closed. */
export function recoveryReleaseAllowlist(
  env: Record<string, string | undefined> = process.env,
): { enabled: boolean; allowIds: ReadonlySet<string> } {
  const raw = (env.APPLICATION_RECOVERY_RELEASE ?? "off").trim();
  const extra = parseIds(env.APPLICATION_RECOVERY_RELEASE_IDS);
  const lowered = raw.toLowerCase();
  if (!raw || lowered === "off" || lowered === "0" || lowered === "false") {
    return { enabled: false, allowIds: new Set() };
  }
  const fromValue = (lowered === "on" || lowered === "true" || lowered === "1")
    ? []
    : parseIds(raw);
  const allowIds = new Set([...fromValue, ...extra]);
  if (allowIds.size === 0 || allowIds.size > ACTIVATION_RELEASE_MAX) {
    return { enabled: false, allowIds: new Set() };
  }
  return { enabled: true, allowIds };
}

export type ReleaseTx = {
  applicationReleaseGrant: {
    create: (args: { data: { applicationId: string; batchId: string } }) => Promise<unknown>;
  };
  applicationReleaseBatch: {
    updateMany: (args: {
      where: { id: string; usedCount: { lt: number } };
      data: { usedCount: { increment: number } };
    }) => Promise<{ count: number }>;
  };
};

export type ReleaseDb = ReleaseTx & {
  $transaction?: <T>(fn: (tx: ReleaseTx) => Promise<T>) => Promise<T>;
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
}

async function withReleaseTx<T>(db: ReleaseDb, fn: (tx: ReleaseTx) => Promise<T>): Promise<T> {
  if (typeof db.$transaction === "function") return db.$transaction(fn);
  return fn(db);
}

/**
 * Atomically grant one application id against the shared batch.
 * Returns false when the gate is off, the id is not allowlisted, it was
 * already granted, or the global usedCount would exceed maxCount.
 */
export async function tryConsumeRecoveryRelease(
  applicationId: string,
  opts: { db?: ReleaseDb | object; env?: Record<string, string | undefined> } = {},
): Promise<boolean> {
  const cfg = recoveryReleaseAllowlist(opts.env ?? process.env);
  if (!cfg.enabled || !cfg.allowIds.has(applicationId)) return false;
  const db = (opts.db ?? prisma) as ReleaseDb;
  try {
    return await withReleaseTx(db, async (tx) => {
      await tx.applicationReleaseGrant.create({
        data: { applicationId, batchId: ACTIVATION_RELEASE_BATCH_ID },
      });
      const increment = await tx.applicationReleaseBatch.updateMany({
        where: { id: ACTIVATION_RELEASE_BATCH_ID, usedCount: { lt: ACTIVATION_RELEASE_MAX } },
        data: { usedCount: { increment: 1 } },
      });
      if (increment.count !== 1) throw new Error("activation_release_budget_exhausted");
      return true;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    if (error instanceof Error && error.message === "activation_release_budget_exhausted") return false;
    throw error;
  }
}

/** In-memory stand-in of the unique grant + conditional increment. For tests. */
export function createMemoryReleaseDb(maxCount = ACTIVATION_RELEASE_MAX): ReleaseDb & {
  grants: Set<string>;
  usedCount: number;
} {
  const grants = new Set<string>();
  const state = { usedCount: 0 };
  let queue = Promise.resolve();
  const runExclusive = <T>(fn: () => Promise<T> | T): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.then(() => undefined, () => undefined);
    return next;
  };
  const tx: ReleaseTx = {
    applicationReleaseGrant: {
      create: async ({ data }) => {
        if (grants.has(data.applicationId)) {
          const error = new Error("unique") as Error & { code: string };
          error.code = "P2002";
          throw error;
        }
        grants.add(data.applicationId);
      },
    },
    applicationReleaseBatch: {
      updateMany: async ({ where }) => {
        const under = state.usedCount < (where.usedCount.lt ?? maxCount);
        if (!under || where.id !== ACTIVATION_RELEASE_BATCH_ID) return { count: 0 };
        state.usedCount += 1;
        return { count: 1 };
      },
    },
  };
  return {
    grants,
    get usedCount() { return state.usedCount; },
    set usedCount(value: number) { state.usedCount = value; },
    ...tx,
    $transaction: (fn) => runExclusive(async () => {
      const granted = [...grants];
      const used = state.usedCount;
      try {
        return await fn(tx);
      } catch (error) {
        grants.clear();
        for (const id of granted) grants.add(id);
        state.usedCount = used;
        throw error;
      }
    }),
  };
}

/** Mix unique-grant + batch tables onto a fake Prisma (and its `$transaction`). */
export function attachMemoryRelease<T extends object>(
  db: T,
  maxCount = ACTIVATION_RELEASE_MAX,
): T & ReleaseDb & { grants: Set<string>; usedCount: number } {
  const mem = createMemoryReleaseDb(maxCount);
  const target = db as T & ReleaseDb;
  target.applicationReleaseGrant = mem.applicationReleaseGrant;
  target.applicationReleaseBatch = mem.applicationReleaseBatch;
  const existingTx = typeof target.$transaction === "function" ? target.$transaction.bind(target) : undefined;
  target.$transaction = (fn) => {
    if (!existingTx) return mem.$transaction!(fn);
    return existingTx(async (inner) => {
      inner.applicationReleaseGrant = mem.applicationReleaseGrant;
      inner.applicationReleaseBatch = mem.applicationReleaseBatch;
      return fn(inner);
    });
  };
  Object.defineProperty(target, "grants", { get: () => mem.grants, configurable: true });
  Object.defineProperty(target, "usedCount", {
    get: () => mem.usedCount,
    set: (value: number) => { mem.usedCount = value; },
    configurable: true,
  });
  return target as T & ReleaseDb & { grants: Set<string>; usedCount: number };
}
