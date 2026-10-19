import { checkPremiumPage } from "@/lib/premium-gate";
import { PremiumGate } from "@/components/premium-gate";
import { AppTopbar } from "@/components/design/topbar";

/**
 * Founder Coach layout — gate Pro+ centralizzato per tutto il modulo.
 * Se l'utente non è Pro+ vede la presentazione del modulo e il paywall.
 */
export default async function FounderCoachLayout({ children }: { children: React.ReactNode }) {
  const gate = await checkPremiumPage("founder_coach");
  if (!gate.allowed) {
    return (
      <>
        <AppTopbar title="Founder Coach" breadcrumb="Lavoro" />
        <div className="pm-page">
          <header className="pm-page-head">
            <div>
              <h1>Founder Coach</h1>
              <p className="pm-muted">Preparazione ai colloqui per ruoli da founder, CTO e AI builder.</p>
            </div>
          </header>
          <PremiumGate feature="founder_coach" isLoggedIn={!!gate.user} />
        </div>
      </>
    );
  }
  return <>{children}</>;
}
