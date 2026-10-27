import type { Prisma } from "@prisma/client";

// Keep access checks independent of unrelated profile/lifecycle schema additions.
// Every entitlement input remains a required database read: never substitute
// a tier or trial default when a required column is missing.
export const accessUserSelect = {
  email: true,
  tier: true,
  createdAt: true,
  trialEndsAt: true,
  trialGraceEndsAt: true,
  subscriptionStatus: true,
} satisfies Prisma.UserSelect;

// Fields used by current getCurrentUser consumers. Feature-specific data belongs
// in that feature's query, not in every authenticated request.
export const sessionUserSelect = {
  ...accessUserSelect,
  id: true,
  name: true,
  emailVerified: true,
  privacyConsentAt: true,
  pausedUntil: true,
  subscriptionStatus: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  stripePriceId: true,
  currentPeriodEnd: true,
  welcomeSeenAt: true,
  onboardedAt: true,
  locale: true,
  yearsExperience: true,
} satisfies Prisma.UserSelect;

export type CurrentUser = Prisma.UserGetPayload<{ select: typeof sessionUserSelect }>;
