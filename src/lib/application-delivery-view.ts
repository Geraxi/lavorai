import { hasVerifiedSubmissionReceipt } from "@/lib/submission-receipt";

export interface DeliveryView {
  phase: "confirmed" | "accepted" | "delivered" | "failed" | "unconfirmed" | "pending" | "manual";
  label: string;
  detail: string;
  tone: "positive" | "warning" | "neutral";
}
export function applicationDeliveryView(app: {
  status: string;
  submittedVia: string | null;
  submitConfirmation: string | null;
  submissionReceiptJson?: string | null;
  emailAttempts?: Array<{ status: string; acceptedAt?: Date | string | null; providerEmailId?: string | null }>;
}): DeliveryView {
  const email = app.emailAttempts?.[0];
  if (app.status === "diagnostic") return { phase: "pending", label: "Test diagnostico", tone: "neutral",
    detail: `Dati fittizi, esclusi da quote e risultati. Stato provider: ${email?.status ?? "non inviato"}.` };
  if (email && ["failed", "bounced", "complained"].includes(email.status)) {
    return { phase: "failed", label: email.status === "complained" ? "Email segnalata" : "Email non consegnata", tone: "warning",
      detail: "Il provider ha segnalato un problema. Non effettuiamo un altro invio automatico." };
  }
  if (email?.status === "delivered") return { phase: "delivered", label: "Email consegnata", tone: "positive",
    detail: "Il server email destinatario ha accettato il messaggio. Questo non prova una lettura o una risposta del recruiter." };
  if (email && ["accepted", "delayed"].includes(email.status) && email.providerEmailId) {
    return { phase: "accepted", label: email.status === "delayed" ? "Consegna email in ritardo" : "Email accettata dal provider", tone: "neutral",
      detail: "L'invio è registrato dal provider; la consegna al destinatario non è ancora confermata." };
  }
  if (hasVerifiedSubmissionReceipt(app.submissionReceiptJson, app.submittedVia)) {
    return { phase: "confirmed", label: "Ricevuta ATS verificata", tone: "positive",
      detail: "Il portale ha confermato la ricezione della candidatura. L'azienda decide se e quando rispondere." };
  }
  if (app.submittedVia === "manual" || app.submitConfirmation === "MANUAL") {
    return { phase: "manual", label: "Invio dichiarato da te", tone: "neutral", detail: "Candidatura importata manualmente, senza verifica di invio da LavorAI." };
  }
  if (app.submitConfirmation === "UNCONFIRMED" || app.submitConfirmation === "SUBMISSION_STARTED" || email?.status === "unknown" || app.status === "success") {
    return { phase: "unconfirmed", label: "Esito da verificare", tone: "warning",
      detail: "Manca una prova verificabile. Non effettuiamo un nuovo invio per evitare duplicati; controlla il portale o le email ricevute." };
  }
  if (app.status === "failed" || app.status === "cancelled" || app.submitConfirmation === "JOB_CLOSED") {
    return { phase: "failed", label: "Non inviata", tone: "warning", detail: "La preparazione o l'invio è stato fermato. Non è un rifiuto da parte dell'azienda." };
  }
  const labels: Record<string, string> = {
    queued: "In coda", optimizing: "In preparazione", applying: "Invio in corso", submitting: "Invio in corso",
    awaiting_consent: "In attesa del tuo consenso", needs_answers: "Risposte necessarie", needs_session: "Collegamento necessario",
    ready_to_apply: "Pronta, non inviata",
  };
  return { phase: "pending", label: labels[app.status] ?? "Da completare", tone: "neutral", detail: "Non è ancora disponibile una conferma di invio." };
}
