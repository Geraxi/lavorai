import { prisma } from "@/lib/db";
import { isApplicationAccessPaused } from "@/lib/billing";

/**
 * Verifica la prova al momento dell'invio e riserva il lavoro. Il limite di
 * cinque candidature è giornaliero ed è applicato quando la candidatura viene
 * creata; qui fermiamo solo le righe rimaste in coda dopo la scadenza.
 */
export async function reserveTrialApplication(userId: string, applicationId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${userId}))`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (isApplicationAccessPaused(user)) return false;
    await tx.application.update({ where: { id: applicationId }, data: { status: "optimizing", startedAt: new Date() } });
    return true;
  });
}
