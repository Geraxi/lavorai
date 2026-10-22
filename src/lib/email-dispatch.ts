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
    month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) };
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
    const { day, month } = utcPeriods(now);
    const id = createHash("sha256").update(`${day.toISOString()}/${key ?? randomUUID()}`).digest("hex");
    const existing = await tx.emailReservation.findUnique({ where: { id } });
    if (!existing) {
      const counts = async (since: Date) => {
        // New EmailLog ids equal their reservation ids; old logs remain baseline usage.
        const rows = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM (
          SELECT id FROM "EmailReservation" WHERE "createdAt" >= ${since}
          UNION SELECT id FROM "EmailLog" WHERE "createdAt" >= ${since}
        ) usage`;
        return Number(rows[0].n);
      };
      const { daily, monthly } = emailLimits();
      const reserve = essentialEmail(kind) ? 0 : Math.min(10, Math.floor(daily / 5));
      if (await counts(day) >= daily - reserve || await counts(month) >= monthly - reserve) {
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
