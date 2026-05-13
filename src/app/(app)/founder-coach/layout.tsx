import { checkPremiumPage } from "@/lib/premium-gate";
import { PremiumGate } from "@/components/premium-gate";

/**
 * Founder Coach layout — gate Pro+ centralizzato per tutto il modulo.
 * Tutte le pagine sotto /founder-coach/* passano da qui prima di
 * renderizzare. Se l'utente non è Pro+ vede PremiumGate invece dei
 * contenuti.
 */
export default async function FounderCoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await checkPremiumPage("founder_coach");
  if (!gate.allowed) {
    return <PremiumGate feature="founder_coach" isLoggedIn={!!gate.user} />;
  }
  return <>{children}</>;
}
