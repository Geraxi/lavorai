import { captureServerEvent } from "@/lib/posthog/server";
import { prisma } from "@/lib/db";
import { FREE_APPLICATION_LIMIT, FREE_UPGRADE_MESSAGE, usesFreeQuota } from "@/lib/billing";
import type { CurrentUser } from "@/lib/user-selects";

export async function freePlanBlock(user: CurrentUser) {
  if (!usesFreeQuota(user)) return null;
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { freeApplicationsUsed: true } });
  if (account.freeApplicationsUsed >= FREE_APPLICATION_LIMIT) {
    await captureServerEvent(user.id, "free_quota_exhausted", { plan: "free", free_remaining: 0 });
  }
  return account.freeApplicationsUsed >= FREE_APPLICATION_LIMIT
    ? { error: "free_quota_exhausted", message: FREE_UPGRADE_MESSAGE, upgradeTier: "pro", limit: FREE_APPLICATION_LIMIT }
    : null;
}

/** Read a server-owned preview, never accept generated content from the client. */
export async function approvedPreview(userId: string, jobId: string, previewId?: string) {
  if (!previewId) return null;
  return prisma.applicationPreview.findFirst({ where: { id: previewId, userId, jobId,
    createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) } } });
}
