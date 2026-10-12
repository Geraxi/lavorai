import { prisma } from "@/lib/db";
import { isCardTrialUser } from "@/lib/card-trial-cohort";
import { hasCardTrialPaidAccess } from "@/lib/card-trial-store";
/** Read at every background dispatch/send boundary; User.tier alone is not proof. */
export async function cardTrialAllowsPaidWork(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true } });
  if (!user) return false;
  return !await isCardTrialUser(user) || await hasCardTrialPaidAccess(user.id);
}
