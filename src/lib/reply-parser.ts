/**
 * Classificatore di risposte inbound alle candidature.
 *
 * Quando un recruiter risponde a un'email di candidatura inviata da LavorAI,
 * la reply arriva all'indirizzo per-application (reply+<appId>@inbound) e
 * Resend ce la inoltra via webhook `email.received`. Qui decidiamo:
 *   1. È una risposta UMANA reale o solo rumore (auto-reply / bounce)?
 *   2. Se umana: è un invito a colloquio, un rifiuto, o una risposta generica?
 *
 * Tutto euristico su keyword IT + EN. Volutamente conservativo: in dubbio
 * classifichiamo "risposta" (generica) piuttosto che inventare un colloquio.
 * Mai gonfiare le metriche — l'onestà è il punto di tutta questa feature.
 */

export type ReplyKind = "colloquio" | "rifiutata" | "risposta" | "auto" | "bounce";

export interface ClassifiedReply {
  kind: ReplyKind;
  /** true solo per risposte umane reali (colloquio/rifiutata/risposta). */
  isHuman: boolean;
}

const BOUNCE_FROM = [
  "mailer-daemon",
  "postmaster@",
  "no-reply@",
  "noreply@",
  "donotreply@",
  "do-not-reply@",
];

const BOUNCE_SUBJECT = [
  "delivery status notification",
  "undeliverable",
  "mail delivery failed",
  "returned mail",
  "failure notice",
  "mancata consegna",
  "messaggio non recapitato",
  "notifica di stato della consegna",
];

const AUTO_REPLY = [
  "out of office",
  "automatic reply",
  "auto-reply",
  "autoreply",
  "fuori sede",
  "fuori ufficio",
  "risponderò al mio rientro",
  "sono in ferie",
  "assenza dall'ufficio",
  "this is an automated",
  "do not reply to this email",
  "questo messaggio è generato automaticamente",
];

const REJECTION = [
  // EN
  "unfortunately",
  "we regret to inform",
  "regret to inform",
  "not moving forward",
  "won't be moving forward",
  "will not be moving forward",
  "not be proceeding",
  "decided to proceed with other",
  "decided to move forward with other",
  "other candidates",
  "not selected",
  "were unsuccessful",
  "was unsuccessful",
  "not a fit at this time",
  "not be progressing",
  "position has been filled",
  // IT
  "purtroppo",
  "non siamo in grado",
  "abbiamo deciso di proseguire con altri",
  "proseguire con altri candidati",
  "non andremo avanti",
  "non procederemo",
  "non daremo seguito",
  "selezionato altri candidati",
  "non rientra nel profilo",
  "ci dispiace comunicarti",
  "ci dispiace informarti",
  "posizione è stata chiusa",
  "non possiamo procedere",
];

const INTERVIEW = [
  // EN
  "interview",
  "phone screen",
  "next steps",
  "schedule a call",
  "schedule a chat",
  "book a time",
  "set up a call",
  "set up a time",
  "would love to chat",
  "would love to speak",
  "are you available",
  "your availability",
  "available for a call",
  "hop on a call",
  "calendly.com",
  "meet you",
  "video call",
  // IT
  "colloquio",
  "intervista",
  "fissare un colloquio",
  "fissare una call",
  "fissare una chiamata",
  "ci piacerebbe conoscerti",
  "vorremmo conoscerti",
  "la tua disponibilità",
  "le tue disponibilità",
  "sei disponibile",
  "quando saresti disponibile",
  "organizzare una call",
  "videochiamata",
  "primo colloquio",
  "ti va di sentirci",
];

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export interface ClassifyInput {
  fromAddress: string;
  subject?: string | null;
  bodyText?: string | null;
}

export function classifyReply(input: ClassifyInput): ClassifiedReply {
  const from = (input.fromAddress ?? "").toLowerCase();
  const subject = (input.subject ?? "").toLowerCase();
  const body = (input.bodyText ?? "").toLowerCase();
  const subjectBody = `${subject}\n${body}`;

  // 1. Bounce / mailer-daemon → non è una risposta umana.
  if (
    containsAny(from, BOUNCE_FROM) ||
    containsAny(subject, BOUNCE_SUBJECT)
  ) {
    return { kind: "bounce", isHuman: false };
  }

  // 2. Auto-reply (out of office, ecc.) → non conta come risposta reale.
  if (containsAny(subjectBody, AUTO_REPLY)) {
    return { kind: "auto", isHuman: false };
  }

  // 3. Rifiuto. Controllato PRIMA del colloquio: un'email di rifiuto può
  //    contenere "interview" ("thank you for interviewing") ma resta un no.
  if (containsAny(subjectBody, REJECTION)) {
    return { kind: "rifiutata", isHuman: true };
  }

  // 4. Invito a colloquio / next steps.
  if (containsAny(subjectBody, INTERVIEW)) {
    return { kind: "colloquio", isHuman: true };
  }

  // 5. Risposta umana generica (qualcuno ha scritto, ma senza segnali chiari).
  return { kind: "risposta", isHuman: true };
}

/**
 * Mappa la classificazione → valore `Application.userStatus`.
 * Solo le risposte umane aggiornano lo status. Ritorna null se non si deve
 * toccare userStatus (auto/bounce, o risposta generica che non sovrascrive
 * uno status più avanzato già impostato).
 */
export function replyKindToUserStatus(kind: ReplyKind): string | null {
  switch (kind) {
    case "colloquio":
      return "colloquio";
    case "rifiutata":
      return "rifiutata";
    case "risposta":
      return "risposta";
    default:
      return null;
  }
}
