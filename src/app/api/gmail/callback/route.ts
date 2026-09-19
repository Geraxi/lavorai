import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

/**
 * GET /api/gmail/callback
 *
 * OAuth callback for standalone Gmail linking flow.
 * Receives authorization code from Google, exchanges it for tokens,
 * and stores them in the Account table linked to the authenticated user.
 *
 * Steps:
 *  1. Verify state signature and expiry
 *  2. Exchange code for tokens
 *  3. Fetch Google userinfo to get email + sub
 *  4. Verify email matches user's LavorAI email
 *  5. Upsert Account record with tokens
 *  6. Redirect to /inbox?gmail=linked
 *
 * Session cookies are never touched — user stays logged in.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors (user denied consent, etc.)
  if (error) {
    const errorUrl = new URL("/inbox", req.url);
    errorUrl.searchParams.set("gmail", "error");
    errorUrl.searchParams.set("reason", error === "access_denied" ? "denied" : "oauth_error");
    return NextResponse.redirect(errorUrl);
  }

  if (!code || !state) {
    return redirectWithError(req.url, "missing_params");
  }

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    return redirectWithError(req.url, "server_config");
  }

  // Verify state signature
  const [stateBase64, signature] = state.split(".");
  if (!stateBase64 || !signature) {
    return redirectWithError(req.url, "invalid_state");
  }

  const hmac = crypto.createHmac("sha256", authSecret);
  hmac.update(stateBase64);
  const expectedSignature = hmac.digest("base64url");

  if (signature !== expectedSignature) {
    return redirectWithError(req.url, "invalid_state");
  }

  // Decode and validate state payload
  let statePayload: { userId: string; nonce: string; exp: number };
  try {
    const stateJson = Buffer.from(stateBase64, "base64url").toString("utf-8");
    statePayload = JSON.parse(stateJson);
  } catch {
    return redirectWithError(req.url, "invalid_state");
  }

  if (!statePayload.userId || !statePayload.exp) {
    return redirectWithError(req.url, "invalid_state");
  }

  if (Date.now() > statePayload.exp) {
    return redirectWithError(req.url, "state_expired");
  }

  // Load the user from state (not from session — state is the source of truth for this flow)
  const user = await prisma.user.findUnique({
    where: { id: statePayload.userId },
    select: { id: true, email: true },
  });

  if (!user) {
    return redirectWithError(req.url, "user_not_found");
  }

  // Exchange code for tokens
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return redirectWithError(req.url, "server_config");
  }

  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/gmail/callback`;

  let tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
  };

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[gmail/callback] Token exchange failed:", errorText);
      return redirectWithError(req.url, "token_exchange");
    }

    tokenData = await tokenResponse.json();
  } catch (err) {
    console.error("[gmail/callback] Token exchange error:", err);
    return redirectWithError(req.url, "token_exchange");
  }

  if (!tokenData.access_token) {
    return redirectWithError(req.url, "no_access_token");
  }

  // Fetch Google userinfo to get email and sub
  let googleEmail: string;
  let googleSub: string;

  try {
    const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userinfoResponse.ok) {
      console.error("[gmail/callback] Userinfo fetch failed:", await userinfoResponse.text());
      return redirectWithError(req.url, "userinfo_fetch");
    }

    const userinfo = await userinfoResponse.json();
    googleEmail = userinfo.email;
    googleSub = userinfo.id;

    if (!googleEmail || !googleSub) {
      return redirectWithError(req.url, "userinfo_missing");
    }
  } catch (err) {
    console.error("[gmail/callback] Userinfo fetch error:", err);
    return redirectWithError(req.url, "userinfo_fetch");
  }

  // Verify email match (normalized comparison)
  const normalizedUserEmail = user.email?.trim().toLowerCase();
  const normalizedGoogleEmail = googleEmail.trim().toLowerCase();

  if (normalizedUserEmail !== normalizedGoogleEmail) {
    console.warn(
      `[gmail/callback] Email mismatch: user=${normalizedUserEmail}, google=${normalizedGoogleEmail}`,
    );
    return redirectWithError(req.url, "email_mismatch");
  }

  // Check if another user already owns this Google account
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: googleSub,
      },
    },
    select: { userId: true },
  });

  if (existingAccount && existingAccount.userId !== user.id) {
    console.warn(
      `[gmail/callback] Google account ${googleSub} already linked to user ${existingAccount.userId}`,
    );
    return redirectWithError(req.url, "account_already_linked");
  }

  // Calculate expires_at (unix timestamp in seconds)
  const expiresAt = tokenData.expires_in
    ? Math.floor(Date.now() / 1000) + tokenData.expires_in
    : null;

  // Upsert Account record
  try {
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: googleSub,
        },
      },
      create: {
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId: googleSub,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        expires_at: expiresAt,
        token_type: tokenData.token_type || "Bearer",
        scope: tokenData.scope || null,
        id_token: tokenData.id_token || null,
      },
      update: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || undefined,
        expires_at: expiresAt,
        token_type: tokenData.token_type || "Bearer",
        scope: tokenData.scope || undefined,
        id_token: tokenData.id_token || undefined,
      },
    });
  } catch (err) {
    console.error("[gmail/callback] Account upsert failed:", err);
    return redirectWithError(req.url, "db_error");
  }

  // Success: redirect to inbox
  const successUrl = new URL("/inbox", req.url);
  successUrl.searchParams.set("gmail", "linked");
  return NextResponse.redirect(successUrl);
}

function redirectWithError(baseUrl: string, reason: string): NextResponse {
  const errorUrl = new URL("/inbox", baseUrl);
  errorUrl.searchParams.set("gmail", "error");
  errorUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(errorUrl);
}
