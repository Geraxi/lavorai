/**
 * User notifications for the application mailbox. Sends only to the candidate
 * on lavorai.it. Never auto-replies to employers.
 */
import { sendWithinQuota } from "@/lib/email-quota";
import { mailboxKindLabel, type MailboxKind, type MailboxNotifyMode } from "@/lib/application-mailbox";

export type MailboxNotifyMessage = {
  id: string;
  kind: MailboxKind | string;
  fromAddress: string;
  subject: string | null;
  receivedAt: Date | string;
  jobTitle: string;
  company: string | null;
};

export type MailboxMailer = (input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}) => Promise<string | null>;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export function renderMailboxPriorityEmail(
  user: { name?: string | null; locale?: string | null },
  message: MailboxNotifyMessage,
): { subject: string; text: string; html: string } {
  const en = user.locale === "en";
  const label = mailboxKindLabel(message.kind, en ? "en" : "it");
  const ctx = `${message.jobTitle}${message.company ? ` · ${message.company}` : ""}`;
  const first = user.name?.trim().split(/\s+/)[0];
  const hi = first ? (en ? `Hi ${first},` : `Ciao ${first},`) : en ? "Hi," : "Ciao,";
  const subject = en ? `${label}: ${ctx}` : `${label}: ${ctx}`;
  const lead = message.kind === "interview"
    ? (en ? "An employer may be inviting you to an interview." : "Un’azienda potrebbe invitarti a un colloquio.")
    : (en ? "A recruiter asked a question about your application." : "Un recruiter ha fatto una domanda sulla tua candidatura.");
  const text = `${hi}\n\n${lead}\n${ctx}\n${en ? "From" : "Da"}: ${message.fromAddress}\n${message.subject ?? ""}\n\n${en ? "Open Posta candidature in LavorAI. We never reply to the employer for you." : "Apri Posta candidature in LavorAI. Non rispondiamo noi al recruiter."}\n`;
  const html = `<!doctype html><html lang="${en ? "en" : "it"}"><body style="margin:0;padding:24px;background:#111;color:#f5f5f4;font-family:Inter,system-ui,sans-serif">
  <p>${escapeHtml(hi)}</p><p>${escapeHtml(lead)}</p>
  <p><strong>${escapeHtml(ctx)}</strong><br/>${en ? "From" : "Da"}: ${escapeHtml(message.fromAddress)}</p>
  <p>${escapeHtml(message.subject ?? "")}</p>
  <p style="color:#a8a29e">${en ? "Open Posta candidature in LavorAI. We never reply to the employer for you." : "Apri Posta candidature in LavorAI. Non rispondiamo noi al recruiter."}</p>
  </body></html>`;
  return { subject, text, html };
}

export function renderMailboxDigestEmail(
  user: { name?: string | null; locale?: string | null },
  messages: MailboxNotifyMessage[],
): { subject: string; text: string; html: string } {
  const en = user.locale === "en";
  const first = user.name?.trim().split(/\s+/)[0];
  const hi = first ? (en ? `Hi ${first},` : `Ciao ${first},`) : en ? "Hi," : "Ciao,";
  const subject = en
    ? `Application mailbox: ${messages.length} update${messages.length === 1 ? "" : "s"}`
    : `Posta candidature: ${messages.length} aggiornament${messages.length === 1 ? "o" : "i"}`;
  const lines = messages.slice(0, 20).map((m) =>
    `• ${mailboxKindLabel(m.kind, en ? "en" : "it")} — ${m.jobTitle}${m.company ? ` · ${m.company}` : ""} (${m.fromAddress})`);
  const text = `${hi}\n\n${en ? "Updates on your applications (not a reply to the employer):" : "Aggiornamenti sulle tue candidature (non è una risposta al recruiter):"}\n\n${lines.join("\n")}\n`;
  const html = `<!doctype html><html lang="${en ? "en" : "it"}"><body style="margin:0;padding:24px;background:#111;color:#f5f5f4;font-family:Inter,system-ui,sans-serif">
  <p>${escapeHtml(hi)}</p>
  <p>${en ? "Updates on your applications. We never reply to the employer for you." : "Aggiornamenti sulle tue candidature. Non rispondiamo noi al recruiter."}</p>
  <ul>${messages.slice(0, 20).map((m) => `<li>${escapeHtml(mailboxKindLabel(m.kind, en ? "en" : "it"))} — ${escapeHtml(m.jobTitle)}${m.company ? ` · ${escapeHtml(m.company)}` : ""}</li>`).join("")}</ul>
  </body></html>`;
  return { subject, text, html };
}

export async function sendMailboxPriorityNotice(input: {
  userEmail: string;
  user: { name?: string | null; locale?: string | null };
  message: MailboxNotifyMessage;
  send: MailboxMailer;
}): Promise<boolean> {
  const rendered = renderMailboxPriorityEmail(input.user, input.message);
  const result = await sendWithinQuota("other", input.userEmail, async () => {
    const id = await input.send({
      to: input.userEmail,
      ...rendered,
      idempotencyKey: `mailbox-priority/${input.message.id}`,
    });
    return id ? { data: { id } } : { error: { name: "mailbox_priority_not_accepted" } };
  });
  return result.sent;
}

export async function sendMailboxDigest(input: {
  userEmail: string;
  user: { name?: string | null; locale?: string | null };
  messages: MailboxNotifyMessage[];
  send: MailboxMailer;
}): Promise<boolean> {
  if (!input.messages.length) return false;
  const rendered = renderMailboxDigestEmail(input.user, input.messages);
  const result = await sendWithinQuota("daily_summary", input.userEmail, async () => {
    const id = await input.send({
      to: input.userEmail,
      ...rendered,
      idempotencyKey: `mailbox-digest/${input.userEmail}/${new Date().toISOString().slice(0, 10)}`,
    });
    return id ? { data: { id } } : { error: { name: "mailbox_digest_not_accepted" } };
  });
  return result.sent;
}

export function mailboxNotifyAllowed(mode: MailboxNotifyMode): boolean {
  return mode !== "off";
}

/** Real Resend sender. Tests must inject a fake MailboxMailer instead. */
export function createResendMailboxMailer(env: Record<string, string | undefined> = process.env): MailboxMailer | null {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return null;
  return async (input) => {
    const { Resend } = await import("resend");
    const response = await new Resend(apiKey).emails.send({
      from: env.RESEND_FROM_OVERRIDE ?? env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>",
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }, { idempotencyKey: input.idempotencyKey });
    return response.data?.id ?? null;
  };
}
