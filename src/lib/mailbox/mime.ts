/** Costruzione MIME (RFC 5322 / 2045) pura e testabile per Gmail `raw`. */
import { randomBytes } from "node:crypto";

export interface MailAttachment { filename: string; contentType: string; content: Buffer }
export interface OutgoingMail {
  from: string;
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
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, (m) => m + CRLF).trimEnd();
}

function safeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, "_");
}

/** Rifiuta destinatari/mittenti con header injection o formati non validi. */
export function assertSafeAddress(addr: string): void {
  if (/[\r\n,;<>]/.test(addr) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) throw new Error("invalid_address");
}

export function newMessageId(domain: string): string {
  return `<lavorai.${Date.now().toString(36)}.${randomBytes(8).toString("hex")}@${domain}>`;
}

export function buildMime(mail: OutgoingMail, boundary = `lavorai_${randomBytes(12).toString("hex")}`): string {
  assertSafeAddress(mail.to);
  const fromAddr = mail.from.match(/<([^>]+)>/)?.[1] ?? mail.from;
  assertSafeAddress(fromAddr);
  if (/[\r\n]/.test(mail.subject) || /[\r\n]/.test(mail.messageId)) throw new Error("invalid_header");
  const head = [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Message-ID: ${mail.messageId}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const parts = [
    [`--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(mail.text, "utf8").toString("base64"))].join(CRLF),
    ...mail.attachments.map((a) => [
      `--${boundary}`,
      `Content-Type: ${a.contentType}; name="${safeFilename(a.filename)}"`,
      `Content-Disposition: attachment; filename="${safeFilename(a.filename)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(a.content.toString("base64")),
    ].join(CRLF)),
  ];
  return [...head, "", ...parts, `--${boundary}--`, ""].join(CRLF);
}

export function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
