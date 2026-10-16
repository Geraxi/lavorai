import { prisma } from "@/lib/db";
import type { ChecklistState } from "@/components/onboarding-checklist";
import { isApplicationAccessPaused, requiresPaymentMethodBeforeApp } from "@/lib/billing";
/** Profile completeness and payment access are separate; neither implies a send. */
export async function getOnboardingState(userId: string): Promise<ChecklistState> {
  const [cvCount, prefs, user, card] = await Promise.all([
    prisma.cVDocument.count({ where: { userId } }),
    prisma.userPreferences.findUnique({ where: { userId }, select: { rolesJson: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, tier: true, createdAt: true, trialEndsAt: true, trialGraceEndsAt: true, stripeSubscriptionId: true, subscriptionStatus: true } }),
    prisma.conversionEvent.findFirst({ where: { userId, name: "card_setup_confirmed", source: "stripe_verified" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  let roles: unknown = []; try { roles = JSON.parse(prefs?.rolesJson ?? "[]"); } catch { /* incomplete */ }
  return { hasUploadedCv: cvCount > 0, hasSetPreferences: Array.isArray(roles) && roles.some(r => typeof r === "string" && !!r.trim()),
    hasVerifiedEmail: !!user?.emailVerified, cardConfirmedAt: card?.createdAt.toISOString() ?? null,
    paymentReady: !!user && !requiresPaymentMethodBeforeApp(user) && !isApplicationAccessPaused(user) };
}
