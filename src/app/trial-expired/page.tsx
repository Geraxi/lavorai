import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { freeWeeklyApplyQuota, isApplicationAccessPaused } from "@/lib/billing";
import { isAdmin } from "@/lib/admin";
import { TrialExpiredActions } from "./trial-expired-actions";
import { SupportLink } from "@/components/support-link";
import { Logo } from "@/components/logo";
import { getConfirmedSubmissions } from "@/lib/dashboard-metrics-shared";
import { PrivacyConsentForm } from "@/components/privacy-consent-form";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { cookies } from "next/headers";
import { isTestAccount } from "@/lib/admin";
import { formatExtensionEnd, TRIAL_EXTENSION_DAYS, trialExtensionOffered } from "@/lib/trial-extension";
import { TrialExtensionBanner, TRIAL_EXTENSION_DISMISS_COOKIE } from "./trial-extension-banner";

export const metadata = { title: "Free trial expired | LavorAI", robots: { index: false, follow: false } };

export default async function TrialExpiredPage({ searchParams }: { searchParams: Promise<{ subscribed?: string }> }) {
  const confirming = (await searchParams).subscribed === "1";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAdmin(user.email) || !isApplicationAccessPaused(user)) redirect("/dashboard");
  // The free plan keeps applying on the weekly quota, so the two actions that
  // unblock held applications (privacy consent, form questions) stay usable
  // here. Consent remains an explicit user action via PrivacyConsentForm.
  const now = new Date();
  const offerRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, tier: true, createdAt: true, trialEndsAt: true, trialGraceEndsAt: true, trialExtensionEndsAt: true, stripeSubscriptionId: true, subscriptionStatus: true, emailVerified: true, suspendedAt: true, privacyConsentAt: true, preferences: { select: { autoApplyMode: true, rolesJson: true } }, _count: { select: { cvDocuments: true } } },
  });
  const dismissed = (await cookies()).get(TRIAL_EXTENSION_DISMISS_COOKIE)?.value === "1";
  const showExtension = !!offerRow && !dismissed && trialExtensionOffered(offerRow, now, isTestAccount, isAdmin);
  const [applicationsSent, waitingForAnswers, heldForConsent] = await Promise.all([
    getConfirmedSubmissions(user.id),
    prisma.application.count({ where: { userId: user.id, status: "needs_answers" } }),
    user.privacyConsentAt ? Promise.resolve(0) : prisma.application.count({ where: { userId: user.id, status: { in: ["queued", "needs_user"] }, errorMessage: { contains: "Consenso privacy mancante" } } }),
  ]);
  return (
    <main className="trial-expired-screen min-h-screen flex items-center justify-center bg-background text-foreground px-6 py-12">
      <section className="trial-expired-panel w-full max-w-2xl overflow-hidden rounded-2xl border bg-card shadow-lg">
        <div className="border-b border-border bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,.16),transparent_44%)] px-8 py-8 sm:px-10">
          <div className="mb-6"><Logo /></div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">La tua ricerca, in pausa</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Riprendi da dove eri arrivato.</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">La prova Pro di 7 giorni è terminata. Con il piano gratuito LavorAI continua a inviare fino a {freeWeeklyApplyQuota()} candidature ogni 7 giorni con le tue preferenze attuali. Attiva Pro per far ripartire la ricerca completa, le candidature su misura e il monitoraggio delle risposte.</p>
        </div>
        {showExtension && offerRow && (
          <TrialExtensionBanner
            locale={user.locale ?? "it"}
            endsLabel={formatExtensionEnd(new Date(now.getTime() + TRIAL_EXTENSION_DAYS * 86_400_000), user.locale === "en")}
            needsCv={offerRow._count.cvDocuments === 0}
            needsAutoApply={!offerRow.preferences || !["auto", "hybrid"].includes(offerRow.preferences.autoApplyMode) || offerRow.preferences.rolesJson === "[]"}
            needsConsent={!offerRow.privacyConsentAt}
          />
        )}
        <div className="grid gap-6 px-8 py-7 sm:grid-cols-[1fr_auto] sm:px-10">
          <div>
            <p className="text-sm font-medium text-foreground">{applicationsSent > 0 ? `Durante la prova LavorAI ha inviato ${applicationsSent} ${applicationsSent === 1 ? "candidatura" : "candidature"} per te.` : "Il tuo profilo resta pronto: Pro riattiva subito la tua ricerca."}</p>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
              <li>• 50 candidature al mese</li>
              <li>• CV e lettera adattati a ogni posizione</li>
              <li>• Carta richiesta e condizioni visibili su Stripe: disdici quando vuoi</li>
            </ul>
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-5 py-4 text-left sm:min-w-48">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pro</p>
            <p className="mt-1 text-2xl font-bold">€19,99<span className="text-sm font-normal text-muted-foreground">/mese</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Pagamento sicuro con Stripe</p>
          </div>
        </div>
        {(!user.privacyConsentAt || waitingForAnswers > 0) && (
          <div className="border-t border-border px-8 py-7 sm:px-10 space-y-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">Piano gratuito: azioni richieste</p>
            {!user.privacyConsentAt && (
              <section id="privacy-consent" className="scroll-mt-6">
                <h2 className="text-lg font-semibold">Consenso privacy</h2>
                <p className="mt-1 mb-3 text-sm text-muted-foreground">{heldForConsent > 0 ? `${heldForConsent} ${heldForConsent === 1 ? "candidatura è in attesa" : "candidature sono in attesa"} del tuo consenso privacy. Dopo il salvataggio tornano ai normali controlli di invio.` : "Senza consenso privacy LavorAI non può elaborare le candidature del piano gratuito."}</p>
                <PrivacyConsentForm recorded={false} locale={user.locale ?? "it"} />
              </section>
            )}
            {waitingForAnswers > 0 && (
              <section id="pending-questions">
                <h2 className="text-lg font-semibold">Domande in sospeso</h2>
                <p className="mt-1 mb-3 text-sm text-muted-foreground">{waitingForAnswers} {waitingForAnswers === 1 ? "candidatura attende" : "candidature attendono"} risposte che solo tu puoi dare.</p>
                <Link href="/trial-expired/questions" className="ds-btn inline-flex">Rispondi alle domande</Link>
              </section>
            )}
          </div>
        )}
        <div className="border-t border-border px-8 py-7 sm:px-10">
          <TrialExpiredActions confirming={confirming} />
          <SupportLink />
        </div>
      </section>
    </main>
  );
}
