import { cardTrialEnrollmentAvailable, isCardTrialCohort } from "./card-trial-policy";

/** Public offers describe a signup now; existing account terms use immutable cohort membership. */
export function publicCardTrialRolloutActive(now = new Date()): boolean {
  return isCardTrialCohort({ createdAt: now });
}

export function getPublicCardTrialCopy(locale: string = "it", activeOverride?: boolean) {
  const active = activeOverride ?? publicCardTrialRolloutActive();
  const available = active && cardTrialEnrollmentAvailable();
  const en = locale === "en";
  const summary = en
    ? "3-day limited preview with a card, starting after completed and verified card checkout. One saved tailored CV and cover letter for one job you choose. No applications during the trial."
    : "Anteprima limitata di 3 giorni con carta, dal checkout con carta completato e verificato. Un CV e una lettera su misura salvati per una sola offerta scelta da te. Nessuna candidatura durante la prova.";
  const renewal = en
    ? "Your selected plan is automatically charged after the trial: Pro €19.99/month for 50 applications, or Pro+ €39.99/month for unlimited applications. Cancel before the trial ends in Manage billing to avoid the charge. Applications and other AI features unlock only after the first successful payment."
    : "Il piano scelto viene addebitato automaticamente alla fine della prova: Pro €19,99/mese per 50 candidature oppure Pro+ €39,99/mese per candidature illimitate. Annulla prima della scadenza da Gestisci abbonamento per evitare l’addebito. Le candidature e le altre funzioni AI si attivano solo dopo il primo pagamento riuscito.";
  const unavailable = en ? "Trial enrollment is temporarily unavailable." : "L’attivazione della prova è temporaneamente non disponibile.";
  return { active, available, summary, renewal, unavailable,
    cta: available ? (en ? "Start the 3-day trial" : "Attiva la prova di 3 giorni") : (en ? "See plans" : "Scopri i piani"),
    disclosure: `${available ? "" : `${unavailable} `}${summary} ${renewal}`,
  };
}

/** Only public/auth offer keys change. Never replace authenticated legacy lifecycle strings. */
export function applyPublicCardTrialMessages<T extends Record<string, unknown>>(messages: T, locale: string, activeOverride?: boolean): T {
  const c = getPublicCardTrialCopy(locale, activeOverride);
  if (!c.active) return messages;
  const en = locale === "en";
  const result = structuredClone(messages);
  const overrides: Record<string, string> = {
    "cardTrial.mode": "active", "cardTrial.cta": c.cta, "cardTrial.disclosure": c.disclosure,
    "cardTrial.summary": c.summary, "cardTrial.renewal": c.renewal,
    "cardTrial.availability": c.available ? "available" : "unavailable",
    "nav.signup": c.cta, "hero.cta": c.cta, "hero.ctaPrimaryV2": c.cta,
    "hero.ctaCaption": c.disclosure,
    "hero.checkA": en ? "3 days after verified card checkout" : "3 giorni dal checkout con carta verificato",
    "hero.checkB": en ? "Automatic renewal unless canceled" : "Rinnovo automatico salvo disdetta",
    "hero.checkC": en ? "Cancel in Manage billing" : "Annulla da Gestisci abbonamento",
    "pricing.subtitle": c.disclosure,
    "pricing.riskReducer1": en ? "Card required" : "Carta richiesta",
    "pricing.riskReducer2": en ? "Automatic charge after 3 days unless canceled" : "Addebito automatico dopo 3 giorni salvo disdetta",
    "pricing.riskReducer3": en ? "Cancel in Manage billing before expiry" : "Annulla da Gestisci abbonamento prima della scadenza",
    "interviewBuddy.badge": en ? "Mock interviews · paid plan required" : "Simulazioni colloquio · piano pagato richiesto",
    "interviewBuddy.freeRemaining": en ? "Paid access required" : "Accesso a pagamento richiesto",
    "interviewBuddy.paywallTitle": en ? "Mock interviews require a paid plan" : "Le simulazioni richiedono un piano pagato",
    "interviewBuddy.paywallBody": en ? "Not included in the limited preview. Available after the first successful payment." : "Non incluse nell’anteprima limitata. Disponibili dopo il primo pagamento riuscito.",
    "analizzaCvPage.badge": en ? "Limited preview · card required" : "Anteprima limitata · carta richiesta",
    "analizzaCvPage.title2": en ? "Explore the limited preview." : "Scopri l’anteprima limitata.",
    "analizzaCvPage.subtitle": c.summary, "analizzaCvPage.cta": c.cta,
    "analizzaCvPage.caption": c.disclosure, "analizzaCvPage.howBody": c.disclosure,
    "analizzaCvPage.getTitle": en ? "One tailored CV and cover letter for your chosen job." : "Un CV e una lettera su misura per l’offerta scelta.",
    "analizzaCvPage.bullet1": en ? "One job chosen by you" : "Una sola offerta scelta da te",
    "analizzaCvPage.bullet4": en ? "Saved preview; no applications sent" : "Anteprima salvata; nessuna candidatura inviata",
    "analizzaCvPage.step1": en ? "Create your account and upload your CV." : "Crea l’account e carica il CV.",
    "analizzaCvPage.step2": en ? "Choose Pro or Pro+ and complete verified card checkout." : "Scegli Pro o Pro+ e completa il checkout con carta verificata.",
    "analizzaCvPage.step3": c.summary, "analizzaCvPage.finalTitle": c.cta,
    "leadMagnet.eyebrow": en ? "Limited preview" : "Anteprima limitata",
    "leadMagnet.subtitle": c.disclosure, "leadMagnet.cta": c.cta,
    "howItWorks.cta": c.cta, "ctaFinal.cta": c.cta, "stickyCta.cta": c.cta,
    "auth.signupTitle": en ? "Create your account" : "Crea il tuo account",
    "auth.signupFree": en ? "Create account" : "Crea account",
    "auth.signupSubtitle": c.disclosure, "auth.signupSubheading": c.disclosure,
    "auth.signupTrustFree": en ? "3-day limited preview" : "Anteprima limitata di 3 giorni",
    "auth.signupTrustNoCard": en ? "Card required · automatic renewal" : "Carta richiesta · rinnovo automatico",
    "auth.signupTrustCancel": en ? "Cancel in Manage billing" : "Annulla da Gestisci abbonamento",
    "auth.signupStep3": en ? "Choose a plan and complete card checkout" : "Scegli un piano e completa il checkout con carta",
    "auth.signupStep4": en ? "Preview one chosen job. Applications unlock after first payment." : "Anteprima per una sola offerta. Le candidature si attivano dopo il primo pagamento.",
    "auth.loginBenefit3": c.disclosure,
    "referral.title": en ? "Referral eligibility for the new offer is under review." : "L’idoneità ai referral per la nuova offerta è in verifica.",
    "referral.body": en ? "The new card-trial offer does not currently promise referral credits or free months. Existing eligible credits keep their original terms." : "La nuova offerta con carta non promette attualmente crediti referral o mesi gratuiti. I crediti preesistenti idonei mantengono i termini originari.",
    "referral.stepJoinTitle": en ? "Review the current offer" : "Consulta l’offerta attuale",
    "referral.stepJoinBody": c.disclosure,
    "referral.stepRewardTitle": en ? "Eligibility under review" : "Idoneità in verifica",
    "referral.stepRewardBody": en ? "No new-offer credit is guaranteed at signup or payment." : "Nessun credito per la nuova offerta è garantito alla registrazione o al pagamento.",
    "referral.footnote": en ? "Any eligibility will be explained before enrollment. Existing credits retain their original terms." : "L’eventuale idoneità sarà chiarita prima dell’attivazione. I crediti preesistenti mantengono i termini originari.",
    "referral.cta": en ? "Review eligibility" : "Consulta l’idoneità",
    "afterSignup.subtitle": c.disclosure,
    "ctaFinal.subtitle": c.summary, "ctaFinal.caption": c.renewal,
    "howItWorks.step3Title": en ? "Preview first; applications after payment" : "Prima l’anteprima; candidature dopo il pagamento",
    "howItWorks.step3Text": c.disclosure,
    "leadMagnet.bullet2": en ? "One saved tailored CV" : "Un CV su misura salvato",
    "leadMagnet.bullet1": en ? "One chosen job" : "Una sola offerta scelta",
    "leadMagnet.bullet4": en ? "Saved preview; no applications during the trial" : "Anteprima salvata; nessuna candidatura durante la prova",
    "faq.q6Answer": c.renewal,

  };
  for (const [path, value] of Object.entries(overrides)) {
    const [group, key] = path.split(".");
    (result[group] as Record<string, unknown>)[key] = value;
  }
  return result;
}
