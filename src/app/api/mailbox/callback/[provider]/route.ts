import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { encryptString } from "@/lib/crypto";
import { exchangeCode, fetchMailboxAddress, hasRequiredScopes, providerConfigured, verifyState } from "@/lib/mailbox/oauth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = (status: string) => NextResponse.redirect(new URL(`/settings?mailbox=${status}#mailbox`, req.url));
  if (provider !== "gmail" && provider !== "outlook") return back("error");
  // Provider senza credenziali (es. Outlook senza app Azure): nessuno scambio token, esito chiaro.
  if (!providerConfigured(provider)) return back("not_configured");
  const user = await getCurrentUser();
  const secret = process.env.AUTH_SECRET;
  const state = verifyState(req.nextUrl.searchParams.get("state") ?? "", secret ?? "");
  // Lo state deve appartenere all'utente della sessione corrente (anti-CSRF / account mix-up).
  if (!user || !secret || !state || state.userId !== user.id || state.provider !== provider) return back("error");
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return back(req.nextUrl.searchParams.get("error") === "access_denied" ? "denied" : "error");
  try {
    const tokens = await exchangeCode(provider, code, `${req.nextUrl.origin}/api/mailbox/callback/${provider}`);
    if (tokens.scope && !hasRequiredScopes(provider, tokens.scope)) return back("missing_scope");
    const email = (await fetchMailboxAddress(provider, tokens.accessToken)).trim().toLowerCase();
    if (!email) return back("error");
    const data = {
      email, accessTokenEnc: encryptString(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encryptString(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt, scopes: tokens.scope.slice(0, 1000), status: "active", lastError: null,
    };
    await prisma.mailboxConnection.upsert({ where: { userId_provider: { userId: user.id, provider } }, update: data, create: { userId: user.id, provider, ...data } });
    return back("connected");
  } catch (err) {
    console.error("[mailbox] callback failed", err instanceof Error ? err.message : "unknown");
    return back("error");
  }
}
