import { prisma } from "@/lib/db";
import { deleteAllUserFiles } from "@/lib/storage";
import { cancelApplication } from "@/lib/application-queue";

/**
 * Azioni admin sugli utenti (usate da /api/admin/users/[id]).
 * La cancellazione replica il percorso GDPR di /api/account/delete:
 * coda svuotata, file su storage rimossi, hard delete con cascade Prisma.
 */
export async function deleteUserCompletely(userId: string): Promise<{ cancelledApplications: number }> {
  const activeApps = await prisma.application.findMany({
    where: { userId, status: { in: ["awaiting_consent", "queued", "optimizing", "applying", "needs_session", "ready_to_apply", "needs_answers"] } },
    select: { id: true },
  });
  await Promise.allSettled(activeApps.map((a) => cancelApplication(a.id)));
  await deleteAllUserFiles(userId).catch((err) => console.error("[admin/users] storage wipe failed, continuing", err));
  await prisma.user.delete({ where: { id: userId } });
  return { cancelledApplications: activeApps.length };
}

/** Inizio del periodo di conteggio mensile: il 1° del mese, o il reset admin se più recente. */
export function monthlyQuotaSince(quotaResetAt: Date | null | undefined, now = new Date()): Date {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return quotaResetAt && quotaResetAt > monthStart ? quotaResetAt : monthStart;
}
