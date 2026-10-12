import { prisma } from "@/lib/db";
import { CARD_TRIAL_POLICY } from "@/lib/card-trial-policy";

/** The first configured cutoff is persisted and never overwritten. Clearing or
 * moving environment configuration cannot reactivate legacy free access. */
export async function getPersistedCardTrialCutoff(): Promise<Date | null> {
  const configured = process.env.CARD_TRIAL_COHORT_START;
  if (configured && !Number.isFinite(Date.parse(configured))) throw new Error("Invalid card trial cutoff");
  const [schema] = await prisma.$queryRaw<Array<{ exists: boolean }>>`SELECT to_regclass('public."CardTrialPolicy"') IS NOT NULL AS "exists"`;
  if (!schema?.exists) {
    if (configured) throw new Error("Card trial policy schema has not been installed");
    return null;
  }
  if (configured) {
    await prisma.$executeRaw`INSERT INTO "CardTrialRollout" ("id", "startsAt") VALUES (TRUE, ${new Date(configured)}) ON CONFLICT ("id") DO NOTHING`;
  }
  const [rollout] = await prisma.$queryRaw<Array<{ startsAt: Date }>>`SELECT "startsAt" FROM "CardTrialRollout" WHERE "id"=TRUE`;
  return rollout?.startsAt ?? null;
}
/** Persistent policy is authoritative even if rollout configuration is removed.
 * Old installations without the additive schema work while rollout is disabled.
 * Other database errors are never treated as legacy entitlement. */
export async function resolveCardTrialPolicy(user: { id: string; createdAt?: Date | string | null }): Promise<string | null> {
  const cutoff = await getPersistedCardTrialCutoff();
  if (!cutoff) return null;
  const [stored] = await prisma.$queryRaw<Array<{ policy: string }>>`SELECT "policy" FROM "CardTrialPolicy" WHERE "userId"=${user.id}`;
  if (stored) return stored.policy;
  if (!user.createdAt || new Date(user.createdAt).getTime() < new Date(cutoff).getTime()) return null;
  await prisma.$executeRaw`INSERT INTO "CardTrialPolicy" ("userId", "policy") VALUES (${user.id}, ${CARD_TRIAL_POLICY}) ON CONFLICT ("userId") DO NOTHING`;
  return CARD_TRIAL_POLICY;
}
export async function isCardTrialUser(user: { id: string; createdAt?: Date | string | null }): Promise<boolean> {
  return await resolveCardTrialPolicy(user) === CARD_TRIAL_POLICY;
}
/** Anonymous legacy AI cannot be re-enabled by losing rollout configuration. */
export async function cardTrialPublicAccessRestricted(): Promise<boolean> {
  const cutoff = await getPersistedCardTrialCutoff();
  return !!cutoff && new Date(cutoff).getTime() <= Date.now();
}
