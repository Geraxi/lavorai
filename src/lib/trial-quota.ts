import { prisma } from "@/lib/db";
import { FREE_TRIAL_APPLICATION_LIMIT, isApplicationAccessPaused, isLifetimeProPlus, normalizeTier } from "@/lib/billing";

// Count all trial sends and reserved work, across days/months. Failed and
// cancelled attempts release their slot; manual imports aren't platform sends.
const consumed = {
  status: { notIn: ["failed", "cancelled"] },
  AND: [{ OR: [{ submittedVia: null }, { submittedVia: { not: "manual" } }] }],
  OR: [{ startedAt: { not: null } }, { status: "success" }],
};
export async function remainingTrialApplications(user: { id: string; tier: string; email: string }) {
  if (normalizeTier(user.tier) !== "free" || isLifetimeProPlus(user.email)) return Infinity;
  const used = await prisma.application.count({ where: { userId: user.id, ...consumed } });
  return Math.max(0, FREE_TRIAL_APPLICATION_LIMIT - used);
}

/** Serialize reservations per user so concurrent workers cannot send a 21st application. */
export async function reserveTrialApplication(userId: string, applicationId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${userId}))`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (isApplicationAccessPaused(user)) return false;
    if (normalizeTier(user.tier) === "free" && !isLifetimeProPlus(user.email)) {
      const used = await tx.application.count({ where: { userId, id: { not: applicationId }, ...consumed } });
      if (used >= FREE_TRIAL_APPLICATION_LIMIT) return false;
    }
    await tx.application.update({ where: { id: applicationId }, data: { status: "optimizing", startedAt: new Date() } });
    return true;
  });
}
