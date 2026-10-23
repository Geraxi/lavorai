import type { Prisma } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { essentialEmail, EmailDispatchError, EMAIL_LEASE_MS, EMAIL_SPACING_MS } from "@/lib/email-dispatch-policy";

function limit(value: string | undefined, fallback: number) {
  const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}
export function emailLimits() {
  return { daily: limit(process.env.RESEND_DAILY_LIMIT, 95), monthly: limit(process.env.RESEND_MONTHLY_LIMIT, 2900) };
}
export function utcPeriods(now: Date) {
  return { day: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    // A trailing 31-day window contains any monthly billing cycle, including
    // accounts whose reset is not on the first. Deliberately conservative.
    month: new Date(+now - 31 * 86400000) };
}

/** A committed reservation precedes the provider boundary. The row lock serializes
 * quota and lease admission across hosts. Failures intentionally consume capacity. */
export async function acquireEmailDispatch(kind: string, key?: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "EmailDispatchGate" (id, "nextAt") VALUES ('resend', TIMESTAMP '1970-01-01') ON CONFLICT DO NOTHING`;
    await tx.$queryRaw`SELECT id FROM "EmailDispatchGate" WHERE id = 'resend' FOR UPDATE`;
    const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const gate = await tx.emailDispatchGate.findUniqueOrThrow({ where: { id: "resend" } });
    if (gate.nextAt > now || (gate.leaseUntil && gate.leaseUntil > now)) throw new EmailDispatchError("email_rate_wait", true, true);
    const { day } = utcPeriods(now);
    const id = createHash("sha256").update(`${day.toISOString()}/${key ?? randomUUID()}`).digest("hex");
    const existing = await tx.emailReservation.findUnique({ where: { id } });
    const usage = await emailUsage(tx, now);
    const { daily, monthly } = emailLimits();
    // A reconciled provider floor can invalidate previously reserved capacity.
    // Preserve the key, but do not let ambiguous retries exceed the global cap.
    if (existing && (usage.today > daily || usage.month > monthly)) throw new EmailDispatchError("email_quota_wait", true, true);
    if (!existing) {
      const reserve = essentialEmail(kind) ? 0 : Math.min(10, Math.floor(daily / 5));
      if (usage.today >= daily - reserve || usage.month >= monthly - reserve) {
        throw new EmailDispatchError("email_quota_wait", true, true);
      }
      await tx.emailReservation.create({ data: { id, createdAt: now } });
    }
    const token = randomUUID();
    const until = new Date(+now + EMAIL_LEASE_MS);
    await tx.emailDispatchGate.update({ where: { id: "resend" }, data: { leaseToken: token, leaseUntil: until } });
    return { id, token, until };
  });
}
export async function releaseEmailDispatch(token: string) {
  // Space starts AFTER completion, so simultaneous producers cannot accumulate slots.
  await prisma.$executeRaw`UPDATE "EmailDispatchGate" SET "leaseToken" = NULL, "leaseUntil" = NULL,
    "nextAt" = (clock_timestamp() AT TIME ZONE 'UTC') + ${EMAIL_SPACING_MS} * interval '1 millisecond'
    WHERE id = 'resend' AND "leaseToken" = ${token}`;
}

/** Floors include unlogged provider consumption plus all post-snapshot attempts.
 * Multiple immutable observations combine by max, never by lowering a counter. */
export async function emailUsage(db: Pick<Prisma.TransactionClient, "$queryRaw">, now: Date) {
  const { day, month } = utcPeriods(now);
  const [usage] = await db.$queryRaw<Array<{ today: bigint; month: bigint }>>`
    WITH usage AS (
      SELECT id, "createdAt" FROM "EmailReservation"
      UNION SELECT id, "createdAt" FROM "EmailLog"
    ), baselines AS (
      SELECT b.*, (SELECT count(DISTINCT id) FROM usage WHERE "createdAt" >= b."snapshotAt") AS newer
      FROM "EmailQuotaBaseline" b WHERE b."dailyResetAt" > (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC') OR b."monthlyResetAt" > (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    ) SELECT
      GREATEST((SELECT count(DISTINCT id) FROM usage WHERE "createdAt" >= (${day.toISOString()}::timestamptz AT TIME ZONE 'UTC')),
        COALESCE((SELECT max("dailyConsumed" + newer) FROM baselines WHERE "dailyResetAt" > (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')), 0)) AS today,
      GREATEST((SELECT count(DISTINCT id) FROM usage WHERE "createdAt" >= (${month.toISOString()}::timestamptz AT TIME ZONE 'UTC')),
        COALESCE((SELECT max("monthlyConsumed" + newer) FROM baselines WHERE "monthlyResetAt" > (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')), 0)) AS month`;
  return { today: Number(usage.today), month: Number(usage.month) };
}

export type ProviderUsageSnapshot = {
  id: string; observedAt: Date; dailyConsumed: number; monthlyConsumed: number;
  dailyResetAt: Date; monthlyResetAt: Date;
};
/** Operator-only operation. No provider calls, sends, row resets or quota increases.
 * The operator MUST quiesce old/new producers before reading provider usage and
 * keep them stopped through this transaction. The lock cannot fence legacy code. */
export async function initializeEmailQuota(snapshot: ProviderUsageSnapshot, producersQuiesced: boolean) {
  if (!producersQuiesced) throw new Error("email_producers_not_quiesced");
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(snapshot.id)
    || !Number.isSafeInteger(snapshot.dailyConsumed) || snapshot.dailyConsumed < 0
    || !Number.isSafeInteger(snapshot.monthlyConsumed) || snapshot.monthlyConsumed < snapshot.dailyConsumed) throw new Error("invalid_provider_usage");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "EmailDispatchGate" (id, "nextAt") VALUES ('resend', TIMESTAMP '1970-01-01') ON CONFLICT DO NOTHING`;
    await tx.$queryRaw`SELECT id FROM "EmailDispatchGate" WHERE id = 'resend' FOR UPDATE`;
    const old = await tx.emailQuotaBaseline.findUnique({ where: { id: snapshot.id } });
    const inputHash = createHash("sha256").update(JSON.stringify([
      snapshot.observedAt, snapshot.dailyConsumed, snapshot.monthlyConsumed, snapshot.dailyResetAt, snapshot.monthlyResetAt,
    ])).digest("hex");
    if (old) {
      if (old.inputHash !== inputHash) throw new Error("provider_snapshot_conflict");
      return old;
    }
    const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const fresh = +now - +snapshot.observedAt;
    if (!Number.isFinite(fresh) || fresh < -5000 || fresh > 300000
      || !(+snapshot.dailyResetAt > +now && +snapshot.dailyResetAt <= +now + 86400000)
      || !(+snapshot.monthlyResetAt > +now && +snapshot.monthlyResetAt <= +now + 32*86400000)) throw new Error("stale_or_invalid_provider_usage");
    const gate = await tx.emailDispatchGate.findUniqueOrThrow({ where: { id: "resend" } });
    if (gate.leaseUntil && gate.leaseUntil > now) throw new Error("email_dispatch_in_flight");
    // An unresolved pre-snapshot reservation might be retried with its existing
    // key without a fresh admission. Reserve it in addition to provider usage.
    const { day, month } = utcPeriods(now);
    const [uncertain] = await tx.$queryRaw<Array<{ today: bigint; month: bigint }>>`
      SELECT count(*) FILTER (WHERE r."createdAt" >= (${day.toISOString()}::timestamptz AT TIME ZONE 'UTC')) AS today, count(*) AS month
      FROM "EmailReservation" r WHERE r."createdAt" >= (${month.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND NOT EXISTS (SELECT 1 FROM "EmailLog" l WHERE l.id = r.id)`;
    return tx.emailQuotaBaseline.create({ data: {
      id: snapshot.id, inputHash, snapshotAt: now, providerObservedAt: snapshot.observedAt,
      dailyConsumed: snapshot.dailyConsumed + Number(uncertain.today), monthlyConsumed: snapshot.monthlyConsumed + Number(uncertain.month),
      dailyResetAt: snapshot.dailyResetAt, monthlyResetAt: snapshot.monthlyResetAt,
    } });
  });
}
