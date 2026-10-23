/**
 * Provider-agnostic inbound mail contract. Each provider verifies its own
 * webhook signature and normalizes the payload; `hydrate` fetches the body
 * when the webhook carries metadata only (Resend). `fetch` is injectable.
 */
import { verifySvixSignature } from "./signature";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Env = Record<string, string | undefined>;

export interface NormalizedInbound {
  provider: string;
  providerMessageId: string;
  rfcMessageId: string | null;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  receivedAt: Date;
}

export interface InboundProvider {
  name: string;
  /** False = reject (401). Must use the RAW body. */
  verify(headers: Pick<Headers, "get">, rawBody: string, env: Env): boolean;
  /** null = not an inbound-mail event (acknowledge and ignore). Throws on malformed payloads. */
  parse(rawBody: string): NormalizedInbound | null;
  hydrate(mail: NormalizedInbound, env: Env, f?: Fetch): Promise<NormalizedInbound>;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export const resendInbound: InboundProvider = {
  name: "resend",
  verify(headers, rawBody, env) {
    if (!env.RESEND_INBOUND_SECRET) return env.NODE_ENV === "development" && env.INBOUND_ALLOW_UNSIGNED === "1";
    return verifySvixSignature(headers, rawBody, env.RESEND_INBOUND_SECRET);
  },
  parse(rawBody) {
    const event = JSON.parse(rawBody) as { type?: unknown; created_at?: unknown; data?: Record<string, unknown> };
    if (!event || typeof event !== "object" || typeof event.type !== "string") throw new Error("invalid_event");
    if (!["email.received", "inbound.email", "email.inbound"].includes(event.type)) return null;
    const d = event.data;
    if (!d || typeof d !== "object" || !str(d.email_id)?.trim()) throw new Error("missing_email_id");
    const to = Array.isArray(d.to) ? d.to.filter((x): x is string => typeof x === "string") : str(d.to) ? [d.to as string] : [];
    const at = new Date(str(d.created_at) ?? str(event.created_at) ?? Date.now());
    return {
      provider: "resend", providerMessageId: (d.email_id as string).trim(), rfcMessageId: str(d.message_id),
      from: str(d.from) ?? "", to, subject: str(d.subject) ?? "", text: str(d.text), html: str(d.html),
      receivedAt: Number.isFinite(at.getTime()) ? at : new Date(),
    };
  },
  async hydrate(mail, env, f = fetch) {
    if (mail.text?.trim() || mail.html?.trim()) return mail;
    if (!env.RESEND_API_KEY) throw new Error("inbound_body_credentials_unavailable");
    const res = await f(`https://api.resend.com/emails/receiving/${encodeURIComponent(mail.providerMessageId)}`, {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(15_000), cache: "no-store",
    });
    if (!res.ok) throw new Error(`inbound_body_unavailable_${res.status}`);
    const full = (await res.json()) as Record<string, unknown>;
    const headers = (full.headers && typeof full.headers === "object" ? full.headers : {}) as Record<string, unknown>;
    return { ...mail, text: str(full.text), html: str(full.html), from: str(headers.from) ?? (mail.from || str(full.from) || ""), subject: mail.subject || str(full.subject) || "" };
  },
};

export const INBOUND_PROVIDERS: Record<string, InboundProvider> = { resend: resendInbound };
