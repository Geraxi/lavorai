/**
 * OAuth per collegare la casella dell'utente (separato dal login NextAuth:
 * non sostituisce la sessione). State firmato HMAC con AUTH_SECRET, 10 minuti.
 * Env: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (Gmail), MS_CLIENT_ID/
 * MS_CLIENT_SECRET/MS_TENANT_ID (Graph, default "common"), APP_ENCRYPTION_KEY.
 */
import crypto from "node:crypto";
import { GMAIL_SCOPES, GRAPH_SCOPES, type Fetch, type MailboxProvider } from "./providers";

type Env = Record<string, string | undefined>;

export function signState(userId: string, provider: MailboxProvider, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ userId, provider, nonce: crypto.randomBytes(12).toString("hex"), exp: now + 600_000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(state: string, secret: string, now = Date.now()): { userId: string; provider: MailboxProvider } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof p.userId !== "string" || (p.provider !== "gmail" && p.provider !== "outlook") || typeof p.exp !== "number" || p.exp < now) return null;
    return { userId: p.userId, provider: p.provider };
  } catch { return null; }
}

export function providerConfigured(provider: MailboxProvider, env: Env = process.env): boolean {
  return provider === "gmail" ? !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) : !!(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET);
}

export function authorizeUrl(provider: MailboxProvider, redirectUri: string, state: string, env: Env = process.env): string {
  if (provider === "gmail") {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", GMAIL_SCOPES.join(" "));
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("include_granted_scopes", "false");
    u.searchParams.set("state", state);
    return u.toString();
  }
  const u = new URL(`https://login.microsoftonline.com/${env.MS_TENANT_ID || "common"}/oauth2/v2.0/authorize`);
  u.searchParams.set("client_id", env.MS_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", GRAPH_SCOPES.join(" "));
  u.searchParams.set("prompt", "select_account");
  u.searchParams.set("state", state);
  return u.toString();
}

export interface TokenSet { accessToken: string; refreshToken: string | null; expiresAt: Date; scope: string }

function tokenEndpoint(provider: MailboxProvider, env: Env): string {
  return provider === "gmail" ? "https://oauth2.googleapis.com/token" : `https://login.microsoftonline.com/${env.MS_TENANT_ID || "common"}/oauth2/v2.0/token`;
}

async function tokenRequest(provider: MailboxProvider, params: Record<string, string>, f: Fetch, env: Env): Promise<TokenSet> {
  const creds: Record<string, string> = provider === "gmail"
    ? { client_id: env.GOOGLE_CLIENT_ID ?? "", client_secret: env.GOOGLE_CLIENT_SECRET ?? "" }
    : { client_id: env.MS_CLIENT_ID ?? "", client_secret: env.MS_CLIENT_SECRET ?? "", scope: GRAPH_SCOPES.join(" ") };
  const res = await f(tokenEndpoint(provider, env), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...creds, ...params }).toString() });
  if (!res.ok) throw new Error(`token_${res.status}`);
  const b = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!b.access_token) throw new Error("token_missing");
  return { accessToken: b.access_token, refreshToken: b.refresh_token ?? null, expiresAt: new Date(Date.now() + (b.expires_in ?? 3600) * 1000), scope: b.scope ?? "" };
}

export function exchangeCode(provider: MailboxProvider, code: string, redirectUri: string, f: Fetch = fetch, env: Env = process.env) {
  return tokenRequest(provider, { code, redirect_uri: redirectUri, grant_type: "authorization_code" }, f, env);
}

export function refreshAccessToken(provider: MailboxProvider, refreshToken: string, f: Fetch = fetch, env: Env = process.env) {
  return tokenRequest(provider, { refresh_token: refreshToken, grant_type: "refresh_token" }, f, env);
}

/** Verifica che lo scope di invio sia stato davvero concesso (l'utente può deselezionarlo). */
export function hasSendScope(provider: MailboxProvider, scope: string): boolean {
  return provider === "gmail" ? /gmail\.send/.test(scope) : /mail\.send/i.test(scope);
}

export async function fetchMailboxAddress(provider: MailboxProvider, accessToken: string, f: Fetch = fetch): Promise<string> {
  if (provider === "gmail") {
    const r = await f("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) throw new Error(`profile_${r.status}`);
    return ((await r.json()) as { emailAddress: string }).emailAddress;
  }
  const r = await f("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`profile_${r.status}`);
  const b = (await r.json()) as { mail?: string; userPrincipalName?: string };
  return b.mail ?? b.userPrincipalName ?? "";
}
