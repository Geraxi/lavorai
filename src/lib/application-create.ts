import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dailyApplicationLimit, effectiveTier, getLimits } from "@/lib/billing";
import { monthlyQuotaSince } from "@/lib/admin-user-actions";

/** Serialize fresh producers with each other and the worker's user-row lock.
 * Never updates, resumes, or grants consent to an existing application.
 * READ COMMITTED ensures the lookup after waiting sees the winning commit. */
export async function createFreshApplication(
  args: { data: Prisma.ApplicationUncheckedCreateInput },
  db: PrismaClient = prisma,
) {
  return db.$transaction(async tx => {
    const owners = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${args.data.userId} FOR UPDATE`;
    if (owners.length !== 1) throw new Error("application_owner_missing");
    const previous = await tx.application.findFirst({
      where: { userId: args.data.userId, jobId: args.data.jobId }, select: { id: true },
    });
    if (previous) throw new Error("prior_application_exists");
    await tx.$queryRaw`SELECT id FROM "UserPreferences" WHERE "userId" = ${args.data.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: args.data.userId }, select: {
      email: true, tier: true, subscriptionStatus: true, trialActivationVersion: true, createdAt: true, trialEndsAt: true, trialGraceEndsAt: true,
      quotaResetAt: true, preferences: { select: { dailyCap: true } },
    } });
    // Same periods and exclusions as the producers, now after acquiring the
    // shared lock. No provider calls or changes to billing/consent policy.
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const counted = { userId: args.data.userId, status: { notIn: ["failed", "diagnostic"] } };
    const daily = dailyApplicationLimit(user, user.preferences?.dailyCap);
    const monthly = getLimits(effectiveTier(user)).monthlyApplications;
    const usedToday = await tx.application.count({ where: { ...counted, createdAt: { gte: today } } });
    if (usedToday >= daily) throw new Error("daily_limit");
    if (monthly !== Infinity) {
      const usedMonth = await tx.application.count({ where: {
        ...counted, createdAt: { gte: monthlyQuotaSince(user.quotaResetAt, now) },
      } });
      if (usedMonth >= monthly) throw new Error("paywall");
    }
    return tx.application.create({ data: { ...args.data, createdAt: now } });
  }, { isolationLevel: "ReadCommitted" });
}
