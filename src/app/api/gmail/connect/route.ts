import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import crypto from "crypto";

/**
 * GET /api/gmail/connect
 *
 * Standalone Google OAuth flow for linking Gmail to an existing LavorAI account.
 * Does NOT use NextAuth signIn to avoid replacing the JWT session and logging out users.
 *
 * Flow:
 *  1. Verify user is authenticated
 *  2. Generate signed state token containing userId
 *  3. Redirect to Google OAuth authorization URL
 *  4. Google calls back to /api/gmail/callback
 *
 * Requirements:
 *  - User MUST be authenticated (active session)
 *  - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set
 *  - AUTH_SECRET must be set (for HMAC state signing)
 */
export async function GET(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Non autenticato. Accedi prima di collegare Gmail." },
      { status: 401 },
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const authSecret = process.env.AUTH_SECRET;

  if (!clientId) {
    return NextResponse.json(
      { error: "Google OAuth non configurato sul server." },
      { status: 500 },
    );
  }

  if (!authSecret) {
    return NextResponse.json(
      { error: "AUTH_SECRET mancante — impossibile generare state sicuro." },
      { status: 500 },
    );
  }

  // Build signed state token: { userId, nonce, exp }
  const statePayload = {
    userId: session.user.id,
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Date.now() + 10 * 60 * 1000, // 10 minutes
  };

  const stateJson = JSON.stringify(statePayload);
  const stateBase64 = Buffer.from(stateJson).toString("base64url");

  // Sign with HMAC-SHA256
  const hmac = crypto.createHmac("sha256", authSecret);
  hmac.update(stateBase64);
  const signature = hmac.digest("base64url");

  const state = `${stateBase64}.${signature}`;

  // Build Google OAuth authorization URL
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/gmail/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/gmail.readonly");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}
