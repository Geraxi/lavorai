import type { DeliveryView } from "./application-delivery-view";

const english: Record<string, string> = {
  inviata: "Applied", vista: "Viewed", colloquio: "Interview", offerta: "Offer", rifiutata: "Rejected",
  risposta: "Possible recruiter reply", ricevuta: "Receipt", auto: "Automated message", bounce: "Delivery failure",
  "Anteprima, non inviata": "Preview, not submitted",
  "Test diagnostico": "Diagnostic test", "Email segnalata": "Email reported", "Email non consegnata": "Email not delivered",
  "Email consegnata": "Email delivered", "Consegna email in ritardo": "Email delivery delayed",
  "Email accettata dal provider": "Email accepted by provider", "Ricevuta ATS verificata": "Verified ATS receipt",
  "Ricevuta ATS confermata": "ATS receipt confirmed",
  "Invio dichiarato da te": "Submission reported by you", "Esito da verificare": "Outcome unverified",
  "Invii registrati, senza conferma": "Recorded sends, unconfirmed",
  "Inviata (senza conferma)": "Recorded sends, unconfirmed", "Non inviata": "Not submitted",
  "In attesa: limite giornaliero": "Held: daily limit", "In coda": "Queued", "In preparazione": "Preparing", "Invio in corso": "Submitting",
  "In attesa del tuo consenso": "Awaiting your consent", "Risposte necessarie": "Answers needed", "Collegamento necessario": "Connection needed",
  "Pronta, non inviata": "Ready, not submitted", "Da completare": "Incomplete",
};
export function applicationLabel(value: string, locale: string): string {
  return locale === "en" ? english[value] ?? value : value;
}
export function deliveryCopy(delivery: DeliveryView | undefined, locale: string): DeliveryView | undefined {
  if (!delivery || locale !== "en") return delivery;
  const details: Record<DeliveryView["phase"], string> = {
    confirmed: "The portal confirmed receipt of the application. The company decides whether and when to respond.",
    delivered: "The recipient mail server accepted the email. This does not prove recruiter readership or a reply.",
    accepted: "The provider recorded the email; delivery to the recipient is not yet confirmed.",
    manual: "You imported this application. LavorAI has not verified its submission.",
    unconfirmed: "Verifiable proof is missing. To avoid duplicates, no further automatic submission is attempted. Check the portal or received emails.",
    failed: "Preparation or delivery was stopped or failed. This is not a rejection by the company.",
    pending: "No submission confirmation is available yet. Check the application details for the next step.",
  };
  return { ...delivery, label: applicationLabel(delivery.label, locale), detail: details[delivery.phase] };
}
