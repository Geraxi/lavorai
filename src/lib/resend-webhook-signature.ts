import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify the signed raw body and event identity, never parsed/re-encoded JSON.
 * Legacy body-only HMAC signatures are deliberately rejected: no replay bound.
 */
export function verifyResendWebhook(headers: Pick<Headers, "get">, rawBody: string, now = Date.now()): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV === "development" && process.env.RESEND_ALLOW_UNSIGNED_WEBHOOKS === "1";
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const encoded = secret.replace(/^whsec_/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const key = Buffer.from(encoded, "base64");
  if (!key.length) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(/\s+/).some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    const candidate = Buffer.from(value, "base64");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}
