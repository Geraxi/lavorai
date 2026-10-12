import { prisma } from "@/lib/db";
import { cardTrialEnrollmentAvailable, cardTrialHasPaidAccess, cardTrialHasPreviewAccess } from "@/lib/card-trial-policy";
export interface CardTrialEnrollment {
  userId: string; policy: string; customerId: string | null; subscriptionId: string | null;
  tier: "pro" | "pro_plus"; status: string; trialStartedAt: Date | null; trialEndsAt: Date | null;
  cardVerifiedAt: Date | null; paidThrough: Date | null; paidInvoiceId: string | null; firstPaidInvoiceId: string | null;
  checkoutKind: "trial" | "paid_reactivation"; checkoutAttempt: string; checkoutAttemptStartedAt: Date; checkoutSessionId: string | null; checkoutUrl: string | null;
  checkoutExpiresAt: Date | null; cancelAtPeriodEnd: boolean;
}
export async function getCardTrialEnrollment(userId: string): Promise<CardTrialEnrollment | null> {
  const rows = await prisma.$queryRaw<CardTrialEnrollment[]>`SELECT * FROM "CardTrialEnrollment" WHERE "userId" = ${userId}`;
  return rows[0] ?? null;
}
export async function hasCardTrialPreviewWindow(userId: string): Promise<boolean> {
  const row = await getCardTrialEnrollment(userId);
  return !!row && cardTrialHasPreviewAccess(row);
}
export async function assertCardTrialPreviewAccess(userId: string): Promise<boolean> {
  return cardTrialEnrollmentAvailable() && await hasCardTrialPreviewWindow(userId);
}
export async function hasCardTrialPaidAccess(userId: string): Promise<boolean> {
  const row = await getCardTrialEnrollment(userId);
  return !!row && cardTrialHasPaidAccess(row);
}
