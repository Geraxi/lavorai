import { isApplicationVerificationMessage } from "@/lib/reply-security-message";

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

export type ReplyKind =
  | "colloquio"
  | "rifiutata"
  | "risposta"
  | "ricevuta"
  | "auto"
  | "auto_reply"
  | "redirected_to_portal"
  | "bounce";

export interface ClassifiedReply {
  kind: ReplyKind;
  /** true solo per risposte umane reali (colloquio/rifiutata/risposta). */
  isHuman: boolean;
  /** Set (true) only for ATS security / verification codes: kind "auto", never bounce. */
  isSecurityCode?: true;
}

const BOUNCE_FROM = [
  "mailer-daemon",
  "postmaster@",
];

/**
 * System/automated notification senders that should NEVER be classified as
 * colloquio/rifiutata/risposta (human responses). These are CI/CD platforms,
 * monitoring services, and infrastructure notifications.
 */
const SYSTEM_NOTIFICATION_DOMAINS = [
  "vercel.com",
  "github.com",
  "notifications.github.com",
  "gitlab.com",
  "bitbucket.org",
  "railway.app",
  "heroku.com",
  "netlify.com",
  "circleci.com",
  "travis-ci.com",
  "jenkins.io",
  "atlassian.com",
  "jira.atlassian.com",
  "sentry.io",
  "datadog.com",
  "pagerduty.com",
  "statuspage.io",
  "amazonaws.com", // AWS notifications
  "azure.com", // Azure notifications
  "mail.ideabrowser.com",
  "polymarket.com",
  "fundingoptions",
  "tide.co",
  // Job-alert and marketing senders seen in production, never recruiter replies.
  "gulftalent.com",
  "jobs2web.com",
  "gema.de",
  "mailchimp",
  "mcsv.net",
  "sendgrid.net",
  "hubspotemail.net",
  "substack.com",
];

const SYSTEM_NOTIFICATION_FROM = [
  "notifications@",
  "noreply@",
  "no-reply@",
  "donotreply@",
  "do-not-reply@",
  "alerts@",
  "notify@",
  "system@",
  "automated@",
  "jobalerts-noreply@linkedin",
  "jobs-noreply@linkedin",
  "linkedin-notifications@",
  "googlealerts-noreply@google",
  "calendar-notification@google",
  "newsletter@",
  "newsletters@",
  "news@",
  "marketing@",
  "promo@",
  "promotions@",
  "updates@",
  "digest@",
  "jobalerts@",
  "job-alerts@",
  "jobalert@",
];

/** ATS relay / notification domains. Mail from these is automated unless it
 * carries a decision (rejection / interview) or actually asks something. */
const ATS_SENDER = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "hire.lever.co", "workablemail.com", "workable.com",
  "ashbyhq.com", "smartrecruiters.com", "recruitee.com", "recruiteemail.com", "personio.de", "personio.com",
  "teamtailor.com", "teamtailor-mail.com", "bamboohr.com", "jobvite.com", "myworkday.com", "workday.com",
  "successfactors.com", "icims.com", "taleo.net", "breezy.hr", "pinpointhq.com", "join.com", "homerun.co",
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

/**
 * Conferma di ricezione ("abbiamo ricevuto la tua candidatura"): non è una
 * risposta umana, ma è la prova che la candidatura è arrivata. Va in Inbox
 * come ricevuta, separata dalle risposte umane. Controllata PRIMA degli auto-reply perché
 * spesso contiene "do not reply".
 */
const ACKNOWLEDGEMENT = [
  "we have received your application",
  "we've received your application",
  "we received your application",
  "your application has been received",
  "application received",
  "thank you for applying",
  "thanks for applying",
  "thank you for your application",
  "thanks for your application",
  "thank you for your interest in",
  "successfully submitted",
  "application was submitted",
  "abbiamo ricevuto la tua candidatura",
  "abbiamo ricevuto la sua candidatura",
  "candidatura ricevuta",
  "grazie per la candidatura",
  "grazie per la tua candidatura",
  "grazie per esserti candidato",
  "grazie per aver inviato",
  "conferma di ricezione",
  "candidatura inviata con successo",
  "ti ringraziamo per la candidatura",
  "ti ringraziamo per la tua candidatura",
  "la ringraziamo per la candidatura",
  "la ringraziamo per la sua candidatura",
  "abbiamo ricevuto il tuo cv",
  "thanks for your interest in",
  "we appreciate your interest in",
  // NL
  "bedankt voor je sollicitatie",
  "bedankt voor jouw sollicitatie",
  "bedankt voor uw sollicitatie",
  "dank voor je sollicitatie",
  "dank voor uw sollicitatie",
  "dank je wel voor je sollicitatie",
  "we hebben je sollicitatie ontvangen",
  "wij hebben je sollicitatie ontvangen",
  "we hebben jouw sollicitatie ontvangen",
  "wij hebben uw sollicitatie ontvangen",
  "je sollicitatie is ontvangen",
  "uw sollicitatie is ontvangen",
  "ontvangstbevestiging",
  "hartelijk dank voor je sollicitatie",
  "hartelijk dank voor jouw sollicitatie",
  "hartelijk dank voor uw sollicitatie",
  "bedankt voor je interesse in",
  "bedankt voor uw interesse in",
  "we hebben je sollicitatie in goede orde ontvangen",
  "wij hebben je sollicitatie in goede orde ontvangen",
  "wij hebben uw sollicitatie in goede orde ontvangen",
  // DE
  "vielen dank für ihre bewerbung",
  "vielen dank für deine bewerbung",
  "danke für ihre bewerbung",
  "danke für deine bewerbung",
  "wir haben ihre bewerbung erhalten",
  "wir haben deine bewerbung erhalten",
  "ihre bewerbung ist bei uns eingegangen",
  "deine bewerbung ist bei uns eingegangen",
  "eingangsbestätigung",
  "herzlichen dank für ihre bewerbung",
  "herzlichen dank für deine bewerbung",
  "wir bedanken uns für ihre bewerbung",
  "wir bedanken uns für deine bewerbung",
  "wir freuen uns über ihre bewerbung",
  "wir freuen uns über deine bewerbung",
  "ihre bewerbung ist eingegangen",
  "deine bewerbung ist eingegangen",
  "ihre bewerbung wurde erfolgreich übermittelt",
  "deine bewerbung wurde erfolgreich übermittelt",
  // FR
  "merci pour votre candidature",
  "merci de votre candidature",
  "merci pour ta candidature",
  "nous avons bien reçu votre candidature",
  "nous avons reçu votre candidature",
  "votre candidature a bien été reçue",
  "votre candidature a été reçue",
  "accusé de réception",
  "nous vous remercions pour votre candidature",
  "nous vous remercions de votre candidature",
  "nous vous remercions de l'intérêt",
  "votre candidature a bien été transmise",
  "votre candidature a bien été enregistrée",
  "nous accusons réception de votre candidature",
  // ES / PT
  "gracias por tu candidatura",
  "gracias por su candidatura",
  "gracias por postularte",
  "gracias por tu solicitud",
  "hemos recibido tu candidatura",
  "hemos recibido su candidatura",
  "hemos recibido tu solicitud",
  "hemos recibido su solicitud",
  "hemos recibido correctamente tu candidatura",
  "gracias por aplicar",
  "gracias por enviarnos tu candidatura",
  "gracias por tu interés en",
  "te agradecemos tu candidatura",
  "le agradecemos su candidatura",
  "tu candidatura ha sido recibida",
  "su candidatura ha sido recibida",
  "obrigado pela sua candidatura",
  "obrigado pela tua candidatura",
  "recebemos a sua candidatura",
  "recebemos sua candidatura",
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
  "this mailbox is not monitored",
  "this inbox is not monitored",
  "this email address is not monitored",
  "afwezigheidsmelding",
  "abwesenheitsnotiz",
  "réponse automatique",
  "respuesta automática",
];

/** Generic mailbox autoresponders ("thanks for your message, we'll get back to
 * you"). Only counted when the message asks nothing (see classifyReply). */
const SOFT_AUTO_REPLY = [
  "thank you for your message",
  "thank you for your email",
  "thanks for your message",
  "thanks for your email",
  "thank you for contacting",
  "thank you for reaching out",
  "we have received your message",
  "we have received your email",
  "we have received your request",
  "we've received your email",
  "we've received your message",
  "we will get back to you",
  "we'll get back to you",
  "we will respond as soon as possible",
  "we will reply as soon as possible",
  "grazie per il tuo messaggio",
  "grazie per la tua email",
  "abbiamo ricevuto la tua richiesta",
  "ti risponderemo al più presto",
];

/** Employer autoresponder: apply on the careers site, not over email. Never a rejection. */
const PORTAL_REDIRECT = [
  "we don't take any applications over email",
  "we don't take applications over email",
  "we do not take any applications over email",
  "we do not take applications over email",
  "we don't accept applications over email",
  "we don't accept applications via email",
  "we don't accept applications by email",
  "we do not accept applications over email",
  "we do not accept applications via email",
  "we do not accept applications by email",
  "we don't accept cvs via email",
  "we don't accept resumes via email",
  "please apply via our careers",
  "please apply through our careers",
  "please apply on our careers",
  "please apply via our website",
  "please apply through our website",
  "please apply via the portal",
  "please apply through the portal",
  "please apply on our job",
  "apply via our careers site",
  "apply through our careers site",
  "apply via our careers page",
  "apply through our online portal",
  "applications are not accepted via email",
  "applications are not accepted over email",
  "applications are only accepted via",
  "we are unable to accept applications via email",
  "unable to accept applications via email",
  "unable to accept applications over email",
  "non accettiamo candidature via email",
  "non accettiamo candidature via e-mail",
  "non prendiamo candidature via email",
  "candidati sul portale",
  "candidati tramite il portale",
  "invia la candidatura dal portale",
];

/** "We don't accept applications/CVs by e-mail" in any common phrasing. */
const PORTAL_REDIRECT_RE = [
  /\b(?:do not|don't|dont|cannot|can't|can not|unable to|not able to|no longer|will not|won't|do not currently)\s+(?:accept|take|process|review|consider|receive)\s+(?:any\s+)?(?:job\s+)?(?:applications?|cvs?|cv's|resumes?|résumés?)(?:\s+(?:sent|submitted))?\s+(?:by|via|over|through|per|using)\s+(?:e-?mail|mail)\b/,
  /\b(?:applications?|cvs?|resumes?)\s+(?:sent|submitted)?\s*(?:by|via|over|through)\s+e-?mail\s+(?:are not|will not be|cannot be|can't be|won't be)\s+(?:accepted|considered|processed|reviewed)\b/,
  /\bnon (?:accettiamo|prendiamo|valutiamo|consideriamo) (?:più )?(?:candidature|cv|curricula)(?: inviat[ie])? (?:via|tramite|per) (?:e-?mail|posta)\b/,
];

export function isPortalRedirectText(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[’‘]/g, "'");
  return containsAny(normalized, PORTAL_REDIRECT) || PORTAL_REDIRECT_RE.some((re) => re.test(normalized));
}

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
  // NL / DE / FR / ES (explicit decision phrases only)
  "helaas hebben we besloten",
  "helaas moeten we je laten weten",
  "helaas moeten wij je laten weten",
  "leider müssen wir ihnen mitteilen",
  "leider müssen wir dir mitteilen",
  "leider haben wir uns für",
  "nous ne pouvons pas donner une suite favorable",
  "nous avons le regret de vous informer",
  "lamentablemente hemos decidido",
];

const INTERVIEW = [
  // EN - phrases (more specific, less likely to false-match)
  "schedule an interview",
  "interview invitation",
  "invite you to an interview",
  "for an interview",
  "phone interview",
  "technical interview",
  "video interview",
  "in-person interview",
  "phone screen",
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
  "next steps in the process",
  "next steps for your application",
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
  /** Raw message headers when available (any key casing). */
  headers?: Record<string, unknown> | null;
}

function headerValue(headers: Record<string, unknown> | null | undefined, name: string): string | null {
  if (!headers || typeof headers !== "object") return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    if (typeof value === "string") return value.trim().toLowerCase();
    if (Array.isArray(value)) return value.filter((v) => typeof v === "string").join(",").trim().toLowerCase();
  }
  return null;
}

/** RFC 3834 / vendor autoresponder headers (out-of-office, mailbox auto-replies). */
export function hasAutoresponderHeaders(headers: Record<string, unknown> | null | undefined): boolean {
  const autoSubmitted = headerValue(headers, "auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no" && autoSubmitted.startsWith("auto-replied")) return true;
  if (headerValue(headers, "x-autoreply") || headerValue(headers, "x-autorespond") || headerValue(headers, "x-autoresponder")) return true;
  const precedence = headerValue(headers, "precedence");
  if (precedence === "auto_reply") return true;
  const suppress = headerValue(headers, "x-auto-response-suppress");
  return !!suppress && /\b(?:oof|all)\b/.test(suppress) && /out of office|automatic reply|auto(?:matic)?[- ]?reply/.test(headerValue(headers, "subject") ?? "");
}

/** Machine-generated (not necessarily a reply): Auto-Submitted: auto-generated. */
function hasAutoGeneratedHeader(headers: Record<string, unknown> | null | undefined): boolean {
  const autoSubmitted = headerValue(headers, "auto-submitted");
  return !!autoSubmitted && autoSubmitted !== "no";
}

/** Mailing-list / newsletter delivery. */
export function hasBulkHeaders(headers: Record<string, unknown> | null | undefined): boolean {
  const precedence = headerValue(headers, "precedence");
  return precedence === "bulk" || precedence === "list" || precedence === "junk"
    || !!headerValue(headers, "list-id") || !!headerValue(headers, "list-unsubscribe");
}

function senderAddress(from: string): string {
  return (from.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? from.match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? from).toLowerCase();
}

function domainIn(from: string, list: string[]): boolean {
  const domain = senderAddress(from).split("@")[1] ?? "";
  return list.some((ats) => domain === ats || domain.endsWith(`.${ats}`));
}

function fromAtsDomain(from: string): boolean {
  return domainIn(from, ATS_SENDER);
}

const QUESTION_WORD = /\b(?:questions?|vragen|fragen|domande|preguntas?|dudas?|help|aiuto|hilfe|hulp|contact|faq|need assistance)\b/i;
/** Template offers of help ("Heb je in de tussentijd vragen over de functie?",
 * "If you have any questions about the role, ...?"): not a question to the candidate. */
const HELP_OFFER = /\b(?:heb je|hebt u|heeft u|mocht(?:en)? (?:je|u)|have any|do you have any|got any|if you have|should you have|in case of|hast du|haben sie|falls sie|falls du|avez-vous|vous avez des|si vous avez|tienes alguna|tiene alguna|si tienes|si tiene|hai domande|hai delle domande|ha domande|se hai|in caso di)\b/i;

/** A "?" that is not template boilerplate ("Questions?", "Heb je vragen?"). */
function asksAQuestion(body: string): boolean {
  return body.split(/\n+/).some((raw) => {
    const line = raw.replace(/https?:\/\/\S+/g, " ").trim(); // query strings are not questions
    if (!line.includes("?")) return false;
    const boilerplate = QUESTION_WORD.test(line) && (line.length <= 60 || HELP_OFFER.test(line));
    return !boilerplate;
  });
}

export function classifyReply(input: ClassifyInput): ClassifiedReply {
  const from = (input.fromAddress ?? "").toLowerCase();
  const subject = (input.subject ?? "").toLowerCase().replace(/[’‘]/g, "'");
  const body = (input.bodyText ?? "").toLowerCase().replace(/[’‘]/g, "'");
  const subjectBody = `${subject}\n${body}`;
  const headers = input.headers ?? null;

  // 0. ATS security / verification codes (Greenhouse OTP) are their own
  //    automated kind, checked before bounce so they are never stored as a
  //    bounce (25 historical rows were). A real delivery failure that merely
  //    quotes an OTP subject is still a bounce (isApplicationVerificationMessage
  //    excludes mailer-daemon / DSN subjects).
  if (isApplicationVerificationMessage(input)) {
    return { kind: "auto", isHuman: false, isSecurityCode: true };
  }

  // 1. Bounce / mailer-daemon → non è una risposta umana.
  if (
    containsAny(from, BOUNCE_FROM) ||
    containsAny(subject, BOUNCE_SUBJECT)
  ) {
    return { kind: "bounce", isHuman: false };
  }


  // 3. Conferma di ricezione → in Inbox, separata dalle risposte umane,
  //    ma non cambia lo stato (non è un umano che ha letto il CV).
  //    Un umano che scrive "grazie per la candidatura, ci sentiamo domani?"
  //    non è una conferma automatica: se c'è una domanda, o manca ogni
  //    segnale di sistema (no-reply, "non rispondere") e il testo è breve,
  //    resta una risposta umana.
  //    Check BEFORE system notifications so ATS acknowledgements (Greenhouse, Lever)
  //    are properly classified as "ricevuta" instead of generic "auto".
  const asksSomething = asksAQuestion(body);
  const atsSender = fromAtsDomain(from);
  const noReplySender = /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?)(?:[+._-][^@]*)?@/.test(senderAddress(from));
  const systemSignal = atsSender || noReplySender || hasAutoGeneratedHeader(headers) || hasAutoresponderHeaders(headers) ||
    containsAny(from, ["no-reply", "noreply", "donotreply", "do-not-reply", "notification", "careers@", "jobs@", "recruiting@", "talent@", "recruitment@", "recrutement@", "bewerbung@", "karriere@", "sollicitatie@", "werkenbij@", "werving@", "vacatures@", "stellen@", "rrhh@", "seleccion@", "empleo@", "candidature@", "lavora-con-noi@", "greenhouse", "lever.co", "workable", "ashbyhq", "smartrecruiters", "recruitee", "personio", "teamtailor", "bamboohr"]) ||
    containsAny(subjectBody, ["do not reply", "don't reply", "non rispondere", "automat", "this email was sent", "questa email è stata inviata", "unsubscribe"]);
  if (
    containsAny(subjectBody, ACKNOWLEDGEMENT) &&
    !containsAny(subjectBody, REJECTION) &&
    !containsAny(subjectBody, INTERVIEW) &&
    (!asksSomething || atsSender || noReplySender) &&
    (systemSignal || body.length > 250 || containsAny(subject, ACKNOWLEDGEMENT))
  ) {
    return { kind: "ricevuta", isHuman: false };
  }

  // 4. Apply-via-portal / "we don't take applications over email" is an
  //    autoresponder, never a rejection — even if the copy says "unfortunately".
  if (isPortalRedirectText(subjectBody)) {
    return { kind: "redirected_to_portal", isHuman: false };
  }

  // 4b. Autoresponder headers (RFC 3834 Auto-Submitted: auto-replied, X-Autoreply…).
  if (hasAutoresponderHeaders(headers)) {
    return { kind: "auto_reply", isHuman: false };
  }

  // 5. System/automated notifications (CI/CD, monitoring, etc.) → auto, never human.
  //    Check AFTER acknowledgements to allow ATS confirmations through, but BEFORE
  //    INTERVIEW/REJECTION checks to prevent Vercel/GitHub/etc. from hitting the
  //    INTERVIEW keyword path (e.g., "interview" in commit message).
  //    HOWEVER: Don't block noreply@ addresses here - they could be ATS systems
  //    sending important rejection/interview notifications. We'll catch generic
  //    noreply@ at the end if they don't match any job-related patterns.
  if (SYSTEM_NOTIFICATION_DOMAINS.some((domain) => from.includes(domain))) {
    return { kind: "auto", isHuman: false };
  }
  // 5b. Newsletters / mailing lists / marketing senders (not ATS mail, which
  //     may legitimately carry a decision and is handled below).
  if (!atsSender && (hasBulkHeaders(headers) || containsAny(from, SYSTEM_NOTIFICATION_FROM.filter((p) => /news|marketing|promo|updates|digest|alert/.test(p))))) {
    return { kind: "auto", isHuman: false };
  }

  // 6. Auto-reply (out of office, ecc.) → not a recruiter decision.
  if (containsAny(subjectBody, AUTO_REPLY)) {
    return { kind: "auto_reply", isHuman: false };
  }
  if (containsAny(subjectBody, SOFT_AUTO_REPLY) && !asksSomething && !containsAny(subjectBody, REJECTION) && !containsAny(subjectBody, INTERVIEW)) {
    return { kind: "auto_reply", isHuman: false };
  }

  // 7. Rifiuto. Controllato PRIMA del colloquio: un'email di rifiuto può
  //    contenere "interview" ("thank you for interviewing") ma resta un no.
  if (containsAny(subjectBody, REJECTION)) {
    return { kind: "rifiutata", isHuman: true };
  }

  // 8. Invito a colloquio / next steps.
  if (containsAny(subjectBody, INTERVIEW)) {
    return { kind: "colloquio", isHuman: true };
  }

  // 9. Catch remaining system notification senders (noreply@, notifications@, etc.)
  //    that didn't match acknowledgement/rejection/interview patterns above.
  //    These are generic automated messages, not job-related responses.
  if (containsAny(from, SYSTEM_NOTIFICATION_FROM)) {
    return { kind: "auto", isHuman: false };
  }

  // 10. Risposta umana generica: only with human signals. ATS relays,
  //     machine-generated mail and newsletter-style footers that ask nothing
  //     are automated, so they never set userStatus=risposta.
  if (hasAutoGeneratedHeader(headers) && !asksSomething) return { kind: "auto", isHuman: false };
  if (atsSender && !asksSomething) return { kind: "auto", isHuman: false };
  if (!asksSomething && /\bunsubscribe\b|annulla l'iscrizione|disiscriviti|uitschrijven|abmelden|se désabonner|view (?:this email )?in (?:your )?browser/.test(body)) {
    return { kind: "auto", isHuman: false };
  }
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
