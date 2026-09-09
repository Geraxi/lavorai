import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token firmato per link "one-click" nelle email (es. attiva auto-apply).
 * Formato: base64url(payload).base64url(hmac). Payload: userId, purpose,
 * scadenza. Nessuna tabella: la firma con AUTH_SECRET basta, e il link
 * resta valido anche se l'utente lo apre da un dispositivo non loggato.
 */
const secret = () => process.env.AUTH_SECRET ?? process.env.CRON_SECRET ?? "dev-secret";

export function signOneClick(userId: string, purpose: string, ttlDays = 30): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, p: purpose, e: Date.now() + ttlDays * 86400_000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOneClick(token: string, purpose: string): { userId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; p: string; e: number };
    if (data.p !== purpose || data.e < Date.now()) return null;
    return { userId: data.u };
  } catch {
    return null;
  }
}
