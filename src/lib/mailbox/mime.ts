/** Costruzione MIME (RFC 5322 / 2045) pura e testabile per Gmail `raw`. */
import { randomBytes } from "node:crypto";

export interface MailAttachment { filename: string; contentType: string; content: Buffer }
export interface OutgoingMail {
  /** Bare address or `Name <addr>`. */
  from: string;
  /** Optional display name (encoded per RFC 2047 when non-ASCII). */
  fromName?: string | null;
  to: string;
  subject: string;
  text: string;
  attachments: MailAttachment[];
  /** Header Message-ID che generiamo noi: identifica l'invio anche lato destinatario. */
  messageId: string;
}

const CRLF = "\r\n";

/** Header con caratteri non ASCII → encoded-word UTF-8 base64 (RFC 2047). */
export function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  // RFC 2047: each encoded-word <= 75 chars → chunk on whole UTF-8 characters.
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) { words.push(chunk); chunk = ""; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

/** RFC 5322 date-time with numeric zone, e.g. "Fri, 23 Oct 2026 21:09:00 +0000". */
export function rfc2822Date(d: Date): string {
  return d.toUTCString().replace(/GMT$/, "+0000");
}

/** `From` header: display name quoted/encoded, address validated by caller. */
export function formatFrom(from: string, fromName?: string | null): string {
  const addr = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
  const name = (fromName ?? from.match(/^\s*"?([^"<]*?)"?\s*</)?.[1] ?? "").replace(/[\r\n"\\]/g, "").trim();
  if (!name) return addr;
  return /^[\x20-\x7e]*$/.test(name) ? (/^[\w .'-]+$/.test(name) ? `${name} <${addr}>` : `"${name}" <${addr}>`) : `${encodeHeader(name)} <${addr}>`;
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, (m) => m + CRLF).trimEnd();
}

function safeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, "_");
}

/** ASCII fallback + RFC 2231 filename* for non-ASCII names. */
function filenameParams(name: string, param: "name" | "filename"): string {
  const safe = safeFilename(name);
  if (/^[\x20-\x7e]*$/.test(safe)) return `${param}="${safe}"`;
  const ascii = safe.normalize("NFD").replace(/[^\x20-\x7e]/g, "_");
  return `${param}="${ascii}"; ${param}*=UTF-8''${encodeURIComponent(safe)}`;
}

/** Rifiuta destinatari/mittenti con header injection o formati non validi. */
export function assertSafeAddress(addr: string): void {
  if (/[\r\n,;<>]/.test(addr) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) throw new Error("invalid_address");
}

export function newMessageId(domain: string): string {
  return `<lavorai.${Date.now().toString(36)}.${randomBytes(8).toString("hex")}@${domain}>`;
}

export function buildMime(mail: OutgoingMail, boundary = `lavorai_${randomBytes(12).toString("hex")}`, now: Date = new Date()): string {
  assertSafeAddress(mail.to);
  const fromAddr = mail.from.match(/<([^>]+)>/)?.[1] ?? mail.from;
  assertSafeAddress(fromAddr);
  if (/[\r\n]/.test(mail.subject) || /[\r\n]/.test(mail.messageId) || /[\r\n]/.test(mail.fromName ?? "")) throw new Error("invalid_header");
  if (!/^<[^<>\s]+@[^<>\s]+>$/.test(mail.messageId)) throw new Error("invalid_message_id");
  const head = [
    `From: ${formatFrom(mail.from, mail.fromName)}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Message-ID: ${mail.messageId}`,
    `Date: ${rfc2822Date(now)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const parts = [
    [`--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(mail.text, "utf8").toString("base64"))].join(CRLF),
    ...mail.attachments.map((a) => [
      `--${boundary}`,
      `Content-Type: ${a.contentType.replace(/[\r\n;]/g, "")}; ${filenameParams(a.filename, "name")}`,
      `Content-Disposition: attachment; ${filenameParams(a.filename, "filename")}`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(a.content.toString("base64")),
    ].join(CRLF)),
  ];
  return [...head, "", ...parts, `--${boundary}--`, ""].join(CRLF);
}

/** Gmail `raw`: whole RFC 2822 message, base64url without padding. */
export function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
