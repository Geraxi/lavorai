import { formatInboxEmailText } from "@/lib/inbox-email-text";

export interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

function decodePart(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function htmlToReadableText(html: string): string {
  return formatInboxEmailText(html
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n[ \t]+/g, "\n"));
}

/** Prefer the plain-text MIME part; fall back to readable HTML, including nested multipart. */
export function extractGmailBody(payload: GmailPart | undefined, snippet: string): string {
  const flattened: GmailPart[] = [];
  const visit = (part: GmailPart) => {
    flattened.push(part);
    for (const child of part.parts ?? []) visit(child);
  };
  if (payload) visit(payload);

  const plain = flattened.find((part) => part.mimeType === "text/plain" && part.body?.data);
  if (plain?.body?.data) return formatInboxEmailText(decodePart(plain.body.data));

  const html = flattened.find((part) => part.mimeType === "text/html" && part.body?.data);
  if (html?.body?.data) return htmlToReadableText(decodePart(html.body.data));

  if (payload?.body?.data) return formatInboxEmailText(decodePart(payload.body.data));
  return formatInboxEmailText(snippet);
}
