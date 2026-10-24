/**
 * Per-user application mailbox: classify, link, notify policy.
 * Rules first. AI only for leftover "other". Never mark rejected unless explicit.
 * Never auto-replies to employers. OTP bodies stay out of logs.
 */
import { isApplicationVerificationMessage } from "@/lib/reply-security-message";
import { classifyByRules } from "@/lib/inbound/classify";
import {
  classifyReply,
  isPortalRedirectText,
  type ReplyKind,
} from "@/lib/reply-parser";
import { bestApplicationMatch, scoreCandidate, type MatchCandidate } from "@/lib/inbound/match";
import { isSkippedPortalUrl } from "@/lib/ats-skip-hosts";

export const MAILBOX_KINDS = [
  "confirmation",
  "otp",
  "interview",
  "rejection",
  "auto_reply",
  "redirected_to_portal",
  "recruiter_question",
  "other",
] as const;
export type MailboxKind = (typeof MAILBOX_KINDS)[number];

export const MAILBOX_RETENTION_DAYS = 180;
export type MailboxNotifyMode = "priority" | "digest" | "off";
export type MailboxNotifyStatus = "pending" | "immediate_sent" | "digest_queued" | "digest_sent" | "skipped";

const PRIORITY_KINDS = new Set<MailboxKind>(["interview", "recruiter_question"]);
const QUESTION = /\?|could you|can you|would you|please (send|share|confirm|provide)|puoi |potresti |per favore|indicaci|inviaci/i;
const EXPLICIT_REJECTION = [
  /\bregret to inform\b/i,
  /\bwe will not be (moving|progressing|proceeding)\b/i,
  /\bnot (be )?(moving|move) forward with (your|this) application\b/i,
  /\bdecided to (move|proceed) (forward )?with other\b/i,
  /\bposition has (now )?been filled\b/i,
  /\bnot been selected\b/i,
  /\bpurtroppo\b[^.]{0,160}\b(altri candidat|altro candidat|non proceder|non daremo seguito)\b/i,
  /\babbiamo deciso di (proseguire|procedere) con altr/i,
];

export function mailboxNotifyMode(raw: string | null | undefined): MailboxNotifyMode {
  const v = (raw ?? "priority").trim().toLowerCase();
  if (v === "digest" || v === "off") return v;
  return "priority";
}

export function isExplicitRejection(text: string): boolean {
  return EXPLICIT_REJECTION.some((re) => re.test(text));
}

export function classifyMailboxByRules(input: {
  fromAddress: string;
  subject?: string | null;
  bodyText?: string | null;
}): { kind: MailboxKind; by: "rules" } {
  const subject = input.subject ?? "";
  const body = input.bodyText ?? "";
  const text = `${subject}\n${body}`;
  if (isApplicationVerificationMessage(input)) return { kind: "otp", by: "rules" };
  if (isPortalRedirectText(text)) return { kind: "redirected_to_portal", by: "rules" };
  const reply = classifyReply({ fromAddress: input.fromAddress, subject, bodyText: body });
  if (reply.kind === "ricevuta") return { kind: "confirmation", by: "rules" };
  if (reply.kind === "auto_reply") return { kind: "auto_reply", by: "rules" };
  if (reply.kind === "redirected_to_portal") return { kind: "redirected_to_portal", by: "rules" };
  if (reply.kind === "bounce") return { kind: "other", by: "rules" };
  if (isExplicitRejection(text) && classifyByRules(subject, body) === "rejection") {
    return { kind: "rejection", by: "rules" };
  }
  if (reply.kind === "colloquio") return { kind: "interview", by: "rules" };
  if (reply.isHuman && QUESTION.test(text)) return { kind: "recruiter_question", by: "rules" };
  if (reply.kind === "rifiutata" && !isExplicitRejection(text)) return { kind: "other", by: "rules" };
  if (reply.kind === "rifiutata") return { kind: "rejection", by: "rules" };
  if (reply.kind === "risposta" && QUESTION.test(text)) return { kind: "recruiter_question", by: "rules" };
  return { kind: "other", by: "rules" };
}

export function mailboxKindFromAi(value: unknown): MailboxKind | null {
  if (typeof value !== "string") return null;
  const kind = value.trim().toLowerCase();
  if (!(MAILBOX_KINDS as readonly string[]).includes(kind)) return null;
  if (kind === "rejection") return null; // AI must not invent a rejection
  return kind as MailboxKind;
}

export async function classifyMailbox(
  input: { fromAddress: string; subject?: string | null; bodyText?: string | null },
  ai?: ((payload: { subject: string; body: string }) => Promise<string | null>) | null,
): Promise<{ kind: MailboxKind; by: "rules" | "ai" }> {
  const rules = classifyMailboxByRules(input);
  if (rules.kind !== "other" || !ai) return rules;
  const guess = await ai({
    subject: (input.subject ?? "").slice(0, 300),
    body: (input.bodyText ?? "").slice(0, 4000),
  }).catch(() => null);
  const kind = mailboxKindFromAi(guess);
  return kind ? { kind, by: "ai" } : rules;
}

export function mailboxKindToReplyKind(kind: MailboxKind): ReplyKind {
  switch (kind) {
    case "confirmation": return "ricevuta";
    case "otp": return "auto";
    case "interview": return "colloquio";
    case "rejection": return "rifiutata";
    case "auto_reply": return "auto_reply";
    case "redirected_to_portal": return "redirected_to_portal";
    case "recruiter_question": return "risposta";
    default: return "risposta";
  }
}

export function mailboxKindIsHuman(kind: MailboxKind): boolean {
  return kind === "interview" || kind === "rejection" || kind === "recruiter_question";
}

export function inboundCategoryFor(kind: MailboxKind): "confirmation" | "incomplete" | "interview" | "rejection" | "other" {
  if (kind === "confirmation") return "confirmation";
  if (kind === "interview") return "interview";
  if (kind === "rejection") return "rejection";
  if (kind === "otp" || kind === "redirected_to_portal") return "incomplete";
  return "other";
}

export function notifyDecision(kind: MailboxKind, mode: MailboxNotifyMode): MailboxNotifyStatus {
  if (kind === "otp" || mode === "off") return "skipped";
  if (mode === "digest") return "digest_queued";
  return PRIORITY_KINDS.has(kind) ? "pending" : "digest_queued";
}

export function shouldNotifyImmediately(status: MailboxNotifyStatus, kind: MailboxKind, mode: MailboxNotifyMode): boolean {
  return notifyDecision(kind, mode) === "pending" && PRIORITY_KINDS.has(kind) && status !== "skipped";
}

export function mailboxKindLabel(kind: string, locale = "it"): string {
  const en = locale === "en";
  const aliases: Record<string, string> = {
    ricevuta: "confirmation",
    colloquio: "interview",
    rifiutata: "rejection",
    risposta: "recruiter_question",
    auto: "auto_reply",
  };
  const key = aliases[kind] ?? kind;
  const labels: Record<string, [string, string]> = {
    confirmation: ["Ricevuta", "Receipt"],
    otp: ["Codice di verifica", "Verification code"],
    interview: ["Invito a colloquio", "Interview invite"],
    rejection: ["Rifiuto", "Rejection"],
    auto_reply: ["Risposta automatica", "Automatic reply"],
    redirected_to_portal: ["Candidati sul portale", "Apply on the portal"],
    recruiter_question: ["Domanda del recruiter", "Recruiter question"],
    other: ["Messaggio", "Message"],
  };
  const pair = labels[key];
  return pair ? pair[en ? 1 : 0] : (en ? "Message" : "Messaggio");
}

export function redactMailboxBody(kind: string, body: string | null | undefined): string | null {
  if (!body) return null;
  if (kind !== "otp") return body;
  return body
    .replace(/\b([A-Z0-9]{4,12})\b/g, "••••")
    .replace(/\b\d{4,8}\b/g, "••••");
}

export type MailboxMatchJob = MatchCandidate & { url?: string | null };

/** reply+ wins. Otherwise company/title plus sender-vs-ATS/company domain. */
export function linkMailboxApplication(
  candidates: MailboxMatchJob[],
  mail: { from: string; subject: string; body: string },
  replyPlusAppId?: string | null,
): string | null {
  if (replyPlusAppId && candidates.some((c) => c.id === replyPlusAppId)) return replyPlusAppId;
  if (replyPlusAppId) return replyPlusAppId;
  const scored = candidates.map((c) => {
    let s = scoreCandidate(c, mail);
    const fromHost = (mail.from.match(/@([^>\s]+)/)?.[1] ?? "").toLowerCase();
    if (c.url) {
      try {
        const jobHost = new URL(c.url).hostname.toLowerCase();
        const jobBase = jobHost.replace(/^www\./, "");
        if (fromHost && (fromHost === jobBase || fromHost.endsWith(`.${jobBase}`) || jobBase.endsWith(fromHost.replace(/^[^.]+\./, "")))) {
          s += 2;
        }
        const ats = ["greenhouse.io", "lever.co", "ashbyhq.com", "workable.com", "smartrecruiters.com", "recruitee.com"];
        if (ats.some((host) => fromHost.endsWith(host) && jobHost.includes(host.split(".")[0]))) s += 1;
      } catch { /* ignore */ }
    }
    return { id: c.id, s, title: c.title, at: c.at };
  }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s || (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  if (!scored.length) return bestApplicationMatch(candidates, mail);
  if (scored.length > 1 && scored[1].s === scored[0].s) {
    const same = scored.filter((x) => x.s === scored[0].s);
    if (new Set(same.map((x) => x.title.toLowerCase())).size > 1) return null;
  }
  return scored[0].id;
}

export function jobApplySupport(url: string): "supported" | "unsupported" {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (isSkippedPortalUrl(url)) return "unsupported";
    const known = [
      "greenhouse.io", "lever.co", "workable.com", "ashbyhq.com", "smartrecruiters.com",
      "recruitee.com", "personio.", "teamtailor.com", "bamboohr.com", "breezy.hr", "pinpointhq.com",
    ];
    if (known.some((h) => host.includes(h))) return "supported";
    return "unsupported";
  } catch {
    return "unsupported";
  }
}

export function countsAsSentUsage(app: {
  confirmedAt?: Date | string | null;
  sendStatus?: string | null;
  submitConfirmation?: string | null;
  submissionReceiptJson?: string | null;
  submittedVia?: string | null;
}): boolean {
  if (app.confirmedAt) return true;
  if (app.sendStatus === "submitted") return true;
  const conf = (app.submitConfirmation ?? "").toUpperCase();
  return conf.startsWith("DETECTED") || conf === "APPLIED" || conf.includes("RECEIPT");
}

export function mailboxRetentionCutoff(now = new Date(), days = MAILBOX_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
