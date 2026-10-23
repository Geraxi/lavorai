import { isAdmin } from "@/lib/admin";
import { requiresPaymentMethodBeforeApp } from "@/lib/billing";

type OnboardingUser = Parameters<typeof requiresPaymentMethodBeforeApp>[0] & {
  emailVerified?: Date | string | null;
};

/** Shared by the page and handlers: client state never completes activation. */
export function onboardingAccessBlock(user: OnboardingUser) {
  if (isAdmin(user.email)) return null;
  if (!user.emailVerified) return {
    status: 403, error: "email_verification_required",
    message: "Verifica la tua email e accedi prima di continuare.", redirect: "/login?verify=required",
  };
  return null;
}
