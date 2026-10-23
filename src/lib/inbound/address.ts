/** Per-user inbound address helpers. Pure: no DB, no network. */
import { randomBytes } from "node:crypto";

export const DEFAULT_USER_INBOX_DOMAIN = "apply.lavorai.it";

export function userInboxDomain(env: Record<string, string | undefined> = process.env): string | null {
  const d = (env.INBOUND_USER_DOMAIN ?? DEFAULT_USER_INBOX_DOMAIN).trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(d) ? d : null;
}

/** "Mario Rossì" → "mario.rossi". Never empty (falls back to "candidato"). */
export function slugBase(name: string | null | undefined, email?: string | null): string {
  const src = (name?.trim() || email?.split("@")[0] || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const base = src.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").replace(/\.{2,}/g, ".").slice(0, 30).replace(/\.+$/, "");
  return base || "candidato";
}

/** Random suffix makes addresses unguessable and collision-resistant. */
export function newSlug(name: string | null | undefined, email?: string | null, rand: () => string = () => randomBytes(3).toString("hex")): string {
  return `${slugBase(name, email)}.${rand()}`;
}

/** Recipients at our inbox domain (lowercase, bare), excluding reply+<appId> aliases. */
export function inboxRecipients(to: string[] | string | null | undefined, domain: string): string[] {
  const list = (Array.isArray(to) ? to : [to ?? ""]).flatMap((x) => String(x).split(","));
  const out = list.flatMap((v) => {
    const addr = (v.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? v).trim().toLowerCase();
    const m = addr.match(/^([a-z0-9.]+)(?:\+[a-z0-9_-]+)?@([a-z0-9.-]+)$/);
    return m && m[2] === domain && !m[1].startsWith("reply") ? [`${m[1]}@${m[2]}`] : [];
  });
  return [...new Set(out)];
}
