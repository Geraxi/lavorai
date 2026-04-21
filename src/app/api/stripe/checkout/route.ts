import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { stripe, tierToPriceId } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { TIERS, type Tier } from "@/lib/billing";

export const runtime = "nodejs";

const schema = z.object({
  tier: z.enum(["pro", "pro_plus"]),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Devi loggarti." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { tier } = parsed.data as { tier: Tier };
  const priceId = tierToPriceId(tier);
  if (!priceId) {
    // Log dettagliato lato server per debugging (non esposto all'utente).
    console.error(
      `[stripe/checkout] STRIPE_PRICE_ID_${tier.toUpperCase()} mancante. Configuralo in Vercel env vars.`,
    );
    return NextResponse.json(
      {
        error: "pricing_not_configured",
        message:
          "Il checkout è temporaneamente non disponibile. Riprova tra qualche minuto o scrivici.",
      },
      { status: 503 },
    );
  }

  try {
    const s = stripe();

    // Ottieni (o crea) customer Stripe
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await s.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const session = await s.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/settings?subscribed=1`,
      cancel_url: `${siteUrl}/#prezzi?canceled=1`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId: user.id, tier },
      },
      locale: "it",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[/api/stripe/checkout]", err);
    return NextResponse.json(
      {
        error: "stripe_error",
        message: err instanceof Error ? err.message : "Errore Stripe",
      },
      { status: 500 },
    );
  }
}
