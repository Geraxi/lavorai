/**
 * Mappa UI degli stati di una candidatura sulle tappe del percorso utente:
 *
 *   opportunità → documenti in preparazione → da approvare → inviata
 *   (con prova) / esito da verificare / da completare a mano → risposta
 *
 * Solo lettura: non cambia nessuno stato, non scrive nel DB. Il modello
 * degli stati è di proprietà del worker (lavoro in corso su un altro
 * branch); qui ci limitiamo a raggruppare gli stati ESISTENTI per la UI.
 *
 * TODO(status-model): quando arriveranno i nuovi stati, mapparli qui:
 *   - "draft"                → stage "prepared"   (documenti pronti, da rivedere: mostrare la tab Modifiche)
 *   - "approved"             → stage "approved"   (approvata dall'utente, in coda di invio)
 *   - "confirmed_submitted"  → stage "sent"       (prova verificata: ricevuta ATS / consegna email)
 *   - "submitted_unverified" → stage "unverified" (inviata ma senza prova: mai contarla come consegnata)
 *   - "failed"               → stage "stopped"
 *   - "needs_manual"         → stage "manual"     (l'utente deve completare l'invio)
 * Le chiavi sono già presenti in STATUS_STAGE (commentate) per rendere il
 * passaggio una modifica di una riga.
 */

export type JourneyStage =
  | "preparing"
  | "prepared"
  | "awaiting_approval"
  | "approved"
  | "manual"
  | "in_flight"
  | "submitted"
  | "sent"
  | "sent_unverified"
  | "unverified"
  | "stopped";

/** Stato interno (Application.status) → tappa del percorso. */
export const STATUS_STAGE: Record<string, JourneyStage> = {
  queued: "preparing",
  optimizing: "preparing",
  awaiting_consent: "awaiting_approval",
  ready_to_apply: "manual",
  needs_answers: "manual",
  needs_session: "manual",
  answers_claimed: "in_flight",
  applying: "in_flight",
  submitting: "in_flight",
  // "success" NON equivale a consegnata: la prova si legge da
  // deliveryEvidence(). Il conteggio "sent" della dashboard usa le prove.
  success: "unverified",
  failed: "stopped",
  cancelled: "stopped",
  // draft: "prepared",
  // approved: "approved",
  // confirmed_submitted: "sent",
  // submitted_unverified: "unverified",
  // needs_manual: "manual",
};

export function journeyStage(status: string): JourneyStage | null {
  return STATUS_STAGE[status] ?? null;
}

export const STAGE_LABEL: Record<JourneyStage, { it: string; en: string; hint: { it: string; en: string } }> = {
  preparing: { it: "In preparazione", en: "Being prepared", hint: { it: "CV e lettera in lavorazione", en: "CV and letter in progress" } },
  prepared: { it: "Pronte da rivedere", en: "Ready to review", hint: { it: "Controlla le modifiche al CV", en: "Check the CV changes" } },
  awaiting_approval: { it: "Da approvare", en: "Awaiting your approval", hint: { it: "Partono solo se le approvi", en: "Sent only if you approve" } },
  approved: { it: "Approvate", en: "Approved", hint: { it: "In coda di invio", en: "Queued for sending" } },
  manual: { it: "Da completare", en: "Needs your action", hint: { it: "Risposte, accesso o invio manuale", en: "Answers, sign-in or manual sending" } },
  in_flight: { it: "Invio in corso", en: "Sending", hint: { it: "In attesa dell'esito", en: "Waiting for the outcome" } },
  submitted: { it: "Inviate, consegna in attesa", en: "Sent, delivery pending", hint: { it: "Accettate dal provider email, consegna non ancora confermata", en: "Accepted by the email provider, delivery not confirmed yet" } },
  sent: { it: "Inviate con prova", en: "Sent with evidence", hint: { it: "Ricevuta ATS o consegna email confermata", en: "Confirmed ATS receipt or email delivery" } },
  sent_unverified: { it: "Invii registrati, senza conferma", en: "Recorded sends, unconfirmed", hint: { it: "Inviate, senza ricevuta verificabile", en: "Sent, without a verifiable receipt" } },
  unverified: { it: "Esito da verificare", en: "Outcome unverified", hint: { it: "Esito incerto, non un invio registrato", en: "Uncertain outcome, not a recorded send" } },
  stopped: { it: "Non inviate", en: "Not sent", hint: { it: "Fermate prima dell'invio", en: "Stopped before sending" } },
};

/** Singular label for one application row (lists, tables, drawers). */
export const STAGE_ROW_LABEL: Record<JourneyStage, { it: string; en: string }> = {
  preparing: { it: "In preparazione", en: "Being prepared" },
  prepared: { it: "Pronta da rivedere", en: "Ready to review" },
  awaiting_approval: { it: "Da approvare", en: "Awaiting approval" },
  approved: { it: "Approvata", en: "Approved" },
  manual: { it: "Da completare", en: "Needs your action" },
  in_flight: { it: "Invio in corso", en: "Sending" },
  submitted: { it: "Inviata, consegna in attesa", en: "Sent, delivery pending" },
  sent: { it: "Consegna confermata", en: "Delivery confirmed" },
  sent_unverified: { it: "Invii registrati, senza conferma", en: "Recorded send, unconfirmed" },
  unverified: { it: "Esito da verificare", en: "Outcome unverified" },
  stopped: { it: "Non inviata", en: "Not sent" },
};
