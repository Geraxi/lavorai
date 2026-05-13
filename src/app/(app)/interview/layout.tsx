import { checkPremiumPage } from "@/lib/premium-gate";
import { PremiumGate } from "@/components/premium-gate";

/**
 * Interview Copilot layout — gate Pro+ per tutte le pagine sotto
 * /interview/* (prep, live).
 */
export default async function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await checkPremiumPage("interview_copilot");
  if (!gate.allowed) {
    return <PremiumGate feature="interview_copilot" isLoggedIn={!!gate.user} />;
  }
  return <>{children}</>;
}
