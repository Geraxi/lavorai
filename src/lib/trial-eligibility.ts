/** Never infer an unused trial from an absent CURRENT subscription: it may have been canceled. */
export function trialEligibility(
  user: { trialActivationVersion?: number | null; proTrialUsedAt?: Date | null; trialEndsAt?: Date | null } | null,
  hasStripeTrial: boolean,
): "eligible" | "used_or_review_required" {
  return user?.trialActivationVersion === 1 && !user.proTrialUsedAt && !user.trialEndsAt && !hasStripeTrial
    ? "eligible" : "used_or_review_required";
}
