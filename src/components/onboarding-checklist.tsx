import Link from "next/link";
export interface ChecklistState { hasUploadedCv: boolean; hasSetPreferences: boolean; hasVerifiedEmail: boolean; cardConfirmedAt: string | null; paymentReady: boolean }
export function OnboardingChecklist({ state, locale = "it" }: { state: ChecklistState; locale?: string }) {
  const tr = (it: string, en: string) => locale === "en" ? en : it;
  const items = [
    { done: state.hasVerifiedEmail, label: tr("Email verificata", "Email verified"), href: "/verify-email" },
    { done: state.hasUploadedCv, label: tr("CV caricato", "CV uploaded"), href: "/cv" },
    { done: state.hasSetPreferences, label: tr("Preferenze impostate", "Preferences set"), href: "/preferences" },
  ];
  return <section className="workspace-panel setup-checklist"><h2>{tr("Il tuo profilo", "Your profile")} <span className="workspace-chip">{items.filter(i => i.done).length}/3</span></h2>
    {items.map(item => <Link className="setup-row" href={item.href} key={item.href}><span>{item.label}</span><strong>{item.done ? "✓" : tr("Completa", "Complete")}</strong></Link>)}
    <div className="setup-payment"><h3>{tr("Carta e accesso", "Card and access")}</h3><p>{state.cardConfirmedAt ? `${tr("Carta verificata il", "Card verified on")} ${new Date(state.cardConfirmedAt).toLocaleDateString(locale)}` : tr("Verifica carta: storico non disponibile", "Card verification: history unavailable")}</p><p className="workspace-muted">{state.paymentReady ? tr("Accesso disponibile secondo il tuo piano. Non prova la presenza attuale di una carta.", "Access available under your plan. This does not prove a card is currently on file.") : tr("Verifica il piano prima di candidarti.", "Review your plan before applying.")}</p><Link href="/settings#billing" className="fit-link">{tr("Gestisci il piano", "Manage plan")}</Link></div>
  </section>;
}
