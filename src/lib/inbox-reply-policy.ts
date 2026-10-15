/** Email metadata is untrusted. Only one mailbox and bounded RFC message IDs. */
export function singleMailbox(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 320 || /[\r\n\0]/.test(value)) return null;
  const match = value.trim().match(/^(?:[^<>]*<)?([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,})>?$/i);
  return match?.[1].toLowerCase() ?? null;
}
export function messageId(value: unknown): string | null {
  return typeof value === "string" && /^<[^<>\s@]{1,200}@[^<>\s@]{1,200}>$/.test(value) ? value : null;
}
export function referenceIds(value: unknown, parent: string): string {
  const ids = typeof value === "string" && !/[\r\n\0]/.test(value) ? value.split(/\s+/).filter(id => messageId(id)) : [];
  return [...new Set([...ids.slice(-15), parent])].join(" ");
}
export function replyMetadata(data: { message_id?: unknown; headers?: unknown; from?: unknown; reply_to?: unknown }) {
  const headers = data.headers && typeof data.headers === "object" && !Array.isArray(data.headers)
    ? Object.fromEntries(Object.entries(data.headers).map(([key, value]) => [key.toLowerCase(), value])) : {};
  const rfcMessageId = messageId(data.message_id ?? headers["message-id"]);
  const explicitReplyTo = headers["reply-to"] ?? (Array.isArray(data.reply_to) ? data.reply_to.join(",") : data.reply_to);
  const replyToAddress = singleMailbox(explicitReplyTo ?? data.from);
  return { rfcMessageId, replyToAddress, referencesHeader: rfcMessageId ? referenceIds(headers.references, rfcMessageId) : null };
}
export function canReplyToAddress(address: string | null, ownEmail: string, inboundDomain: string): boolean {
  if (!address || address === ownEmail.toLowerCase() || address.endsWith(`@${inboundDomain.toLowerCase()}`)) return false;
  return !/^(?:no[._-]?reply|do[._-]?not[._-]?reply|mailer-daemon|postmaster)(?:[+@._-]|$)/i.test(address);
}
export function replySubject(subject: string | null): string {
  const safe = (subject ?? "").replace(/[\r\n\0]/g, " ").trim().slice(0, 450) || "(no subject)";
  return /^re\s*:/i.test(safe) ? safe : `Re: ${safe}`;
}
export class InboxReplyError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
