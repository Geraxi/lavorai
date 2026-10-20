/**
 * Macchina a stati degli invii dalla casella dell'utente (pura, testata).
 *
 *   prepared ──approve──▶ approved ──send ok (id provider)──▶ submitted
 *      │                     │  └─rifiuto esplicito provider──▶ failed
 *      │                     └─esito ambiguo (timeout/5xx)────▶ unverified
 *      └─cancel──▶ failed(cancelled)
 *   submitted ──rimbalzo/DSN nel thread──▶ failed(bounced)
 *   submitted ──nessun rimbalzo dopo la finestra, ≥1 controllo riuscito──▶ delivery_confirmed
 *   submitted ──thread non leggibile dopo la finestra (token revocato…)──▶ unverified
 *   delivery_confirmed ──rimbalzo tardivo──▶ failed(bounced)   (l'evidenza negativa vince)
 *
 * "delivery_confirmed" significa SOLO: accettata dal provider con id + nessun
 * rimbalzo rilevato entro la finestra. Non è conferma di lettura né di risposta.
 */
export const MAILBOX_STATES = ["prepared", "approved", "submitted", "delivery_confirmed", "failed", "unverified"] as const;
export type MailboxState = (typeof MAILBOX_STATES)[number];

const TRANSITIONS: Record<MailboxState, MailboxState[]> = {
  prepared: ["approved", "failed"],
  approved: ["submitted", "failed", "unverified", "prepared"],
  submitted: ["delivery_confirmed", "failed", "unverified"],
  delivery_confirmed: ["failed"],
  unverified: ["failed", "delivery_confirmed"],
  failed: [],
};

export function canTransition(from: string, to: MailboxState): boolean {
  return (MAILBOX_STATES as readonly string[]).includes(from) && TRANSITIONS[from as MailboxState].includes(to);
}

/** Finestra di osservazione dei rimbalzi: la maggior parte dei DSN arriva in minuti, alcuni in ore. */
export const BOUNCE_WINDOW_HOURS = 48;

export interface ThreadMessage {
  id: string;
  from: string;
  subject: string;
  /** Testo breve (snippet) — usato solo per riconoscere i DSN, mai salvato. */
  snippet?: string;
  date: Date | null;
  /** Content-Type radice (es. multipart/report per i DSN standard). */
  contentType?: string;
  /** Il messaggio è quello inviato da noi. */
  isOurs?: boolean;
}

const BOUNCE_FROM = /(mailer-daemon|postmaster|mail delivery (subsystem|system)|microsoftexchange[0-9a-f]*@|maildelivery|bounce[s]?@)/i;
const BOUNCE_SUBJECT = /(undeliver(able|ed)|delivery status notification \((failure|delay)\)|delivery (has )?failed|mail delivery failed|returned mail|failure notice|non recapitabil|impossibile recapitare|mancato recapito|unzustellbar|address not found)/i;

export function isBounceMessage(m: ThreadMessage): boolean {
  if (m.isOurs) return false;
  if (/multipart\/report/i.test(m.contentType ?? "") && /report-type=?"?delivery-status/i.test(m.contentType ?? "")) return true;
  return BOUNCE_FROM.test(m.from) || (BOUNCE_SUBJECT.test(m.subject) && /(daemon|postmaster|exchange|delivery|mail)/i.test(m.from + " " + m.subject));
}

/** Un ritardo ("Delay") non è un fallimento: non chiude lo stato. */
export function isDelayNotice(m: ThreadMessage): boolean {
  return /\((delay|ritardo)\)|delivery (is )?delayed|ritardo nella consegna/i.test(m.subject);
}

export type DeliveryVerdict =
  | { state: "failed"; reason: "bounced"; evidence: { from: string; subject: string; at: string | null } }
  | { state: "delivery_confirmed" }
  | { state: "unverified"; reason: "thread_unreadable_after_window" }
  | { state: "pending" };

export function evaluateDelivery(input: {
  submittedAt: Date;
  now: Date;
  /** null = thread non leggibile in questo controllo. */
  thread: ThreadMessage[] | null;
  /** Numero di controlli del thread riusciti finora (incluso questo se thread != null). */
  successfulChecks: number;
  windowHours?: number;
}): DeliveryVerdict {
  const windowMs = (input.windowHours ?? BOUNCE_WINDOW_HOURS) * 3_600_000;
  if (input.thread) {
    const bounce = input.thread.find((m) => isBounceMessage(m) && !isDelayNotice(m));
    if (bounce) return { state: "failed", reason: "bounced", evidence: { from: bounce.from.slice(0, 120), subject: bounce.subject.slice(0, 160), at: bounce.date?.toISOString() ?? null } };
  }
  const elapsed = input.now.getTime() - input.submittedAt.getTime() >= windowMs;
  if (!elapsed) return { state: "pending" };
  if (input.thread && input.successfulChecks >= 1) return { state: "delivery_confirmed" };
  if (!input.thread) return { state: "unverified", reason: "thread_unreadable_after_window" };
  return { state: "pending" };
}

export const MAILBOX_STATE_LABEL: Record<MailboxState, { it: string; en: string; tone: "green" | "amber" | "red" | "neutral"; detail: string }> = {
  prepared: { it: "Pronta, da approvare", en: "Prepared", tone: "amber", detail: "Email preparata dalla tua casella: serve la tua approvazione prima dell'invio." },
  approved: { it: "Approvata", en: "Approved", tone: "neutral", detail: "Hai approvato l'invio: partirà dalla tua casella." },
  submitted: { it: "Inviata dalla tua casella", en: "Sent from your mailbox", tone: "neutral", detail: "Il provider ha accettato l'email (id registrato). In attesa della finestra di 48 ore per escludere rimbalzi." },
  delivery_confirmed: { it: "Consegnata, nessun rimbalzo", en: "Delivered, no bounce", tone: "green", detail: "Accettata dal provider e nessun messaggio di mancato recapito nel thread dopo 48 ore. Non indica lettura né risposta." },
  failed: { it: "Non consegnata", en: "Not delivered", tone: "red", detail: "Invio rifiutato o rimbalzato (mancato recapito rilevato nel thread)." },
  unverified: { it: "Esito non verificabile", en: "Unverified", tone: "amber", detail: "Non possiamo confermare l'esito (timeout del provider o casella non più leggibile). Controlla nella cartella Inviati prima di riprovare." },
};
