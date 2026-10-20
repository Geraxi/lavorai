import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authorizeUrl, providerConfigured, signState } from "@/lib/mailbox/oauth";

/** GET /api/mailbox/connect?provider=gmail|outlook — avvia l'OAuth per INVIARE dalla casella dell'utente. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings%23mailbox", req.url));
  const provider = req.nextUrl.searchParams.get("provider");
  if (provider !== "gmail" && provider !== "outlook") return NextResponse.json({ error: "provider non valido" }, { status: 400 });
  const secret = process.env.AUTH_SECRET;
  if (!secret || !providerConfigured(provider)) return NextResponse.redirect(new URL(`/settings?mailbox=not_configured#mailbox`, req.url));
  const redirectUri = `${req.nextUrl.origin}/api/mailbox/callback/${provider}`;
  return NextResponse.redirect(authorizeUrl(provider, redirectUri, signState(user.id, provider, secret)));
}
