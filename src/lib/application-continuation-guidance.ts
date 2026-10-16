/** Display-only next steps. This never grants permission or changes a status. */
export function continuationGuidance(reason: string | null, applicationId: string, en = false) {
  if (reason === "privacy_consent_missing") return {
    detail: en ? "Privacy consent is missing. Read the notice in Settings and choose whether to consent. Application consent and delivery checks still apply."
      : "Manca il consenso privacy. Leggi l’informativa nelle Impostazioni e scegli se acconsentire. Restano necessari il consenso alla candidatura e i controlli di invio.",
    href: "/settings#privacy-consent", label: en ? "Review privacy consent" : "Rivedi il consenso privacy",
  };
  if (reason === "answers_incomplete") return { detail: en ? "Complete or clarify the required answers before confirming continuation." : "Completa o chiarisci le risposte prima di confermare la ripresa.", href: null, label: null };
  return {
    detail: en ? "Continuation is blocked. This attempt has no verifiable safe pause, or its delivery outcome needs review. Saving answers cannot make it safe to retry. Review the application and check the employer portal for an existing application before any manual submission."
      : "Ripresa bloccata. La pausa sicura non è verificabile oppure l’esito richiede un controllo. Salvare risposte non autorizza un nuovo tentativo. Rivedi la candidatura e verifica sul portale aziendale se esiste già prima di un eventuale invio manuale.",
    href: `/applications?id=${encodeURIComponent(applicationId)}&includeAll=1`, label: en ? "Review this application" : "Rivedi questa candidatura",
  };
}
