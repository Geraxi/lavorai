import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Apre il customer portal Stripe per gestire subscription (pause, cancel,
 * aggiornare metodo pagamento, scaricare fatture).
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!user.stripeCustomerId) {
    return NextResponse.json(
      { error: "no_customer", message: "Nessuna subscription attiva." },
      { status: 404 },
    );
  }

  try {
    const s = stripe();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const session = await s.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${siteUrl}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[/api/stripe/portal]", err);
    return NextResponse.json(
      {
        error: "stripe_error",
        message: err instanceof Error ? err.message : "Errore Stripe",
      },
      { status: 500 },
    );
  }
}
