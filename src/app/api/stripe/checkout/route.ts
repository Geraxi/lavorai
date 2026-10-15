import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ensureReferralCoupon, stripe, tierToPriceId } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { TIERS, type Tier } from "@/lib/billing";
import { AnalyticsEvent } from "@/lib/analytics";
import { recordConversionEvent } from "@/lib/conversion-events";
import { CARD_REQUIRED_CHECKOUT } from "@/lib/stripe-subscription-access";

export const runtime = "nodejs";


const schema = z.object({
  tier: z.enum(["free", "pro", "pro_plus"]),
  // The expired-trial screen must return to itself on cancellation so the
  // user does not lose the exact recovery action they just chose.
  returnTo: z.literal("trial_expired").optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Devi loggarti." },
      { status: 401 },
    );
  }

  // Card setup precedes profile onboarding. Email ownership is still required.
  if (!user.emailVerified) {
    return NextResponse.json({ error: "email_verification_required", message: "Verifica prima la tua email.", redirect: "/login?verify=required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { tier, returnTo } = parsed.data as { tier: Tier; returnTo?: "trial_expired" };
  // Use a Dashboard configuration with Cards enabled and non-card methods disabled.
  const cardConfiguration = process.env.STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION;
  if (!cardConfiguration) return NextResponse.json({ error: "card_checkout_not_configured",
    message: "Il checkout è temporaneamente non disponibile. Riprova tra poco." }, { status: 503 });
  const priceId = tierToPriceId(tier);
  if (tier !== "free" && !priceId) {
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
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    // Guardia anti-doppio abbonamento: se il customer ha già una subscription
    // viva (active/trialing/past_due), NON apriamo un secondo checkout (è
    // successo: stesso utente addebitato due volte). Lo mandiamo al portale
    // Stripe, dove può cambiare piano o aggiornare la carta.
    if (user.stripeCustomerId) {
      const existing = await s.subscriptions.list({ customer: user.stripeCustomerId, status: "all", limit: 10 });
      const live = existing.data.find((sub) => ["active", "trialing", "past_due", "unpaid"].includes(sub.status));
      if (live) {
        const portal = await s.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${siteUrl}/settings` });
        return NextResponse.json({
          url: portal.url,
          alreadySubscribed: true,
          message: live.status === "past_due" || live.status === "unpaid"
            ? "Hai già un abbonamento con un pagamento in sospeso: aggiorna la carta dal portale."
            : "Hai già un abbonamento attivo: gestiscilo dal portale.",
        });
      }
    }

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

    const free = tier === "free";
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { referralCredits: true } });
    const referralCoupon = !free && (fresh?.referralCredits ?? 0) > 0 ? await ensureReferralCoupon(s) : null;
    const metadata = { userId: user.id, cardRequired: CARD_REQUIRED_CHECKOUT, tier };
    const session = await s.checkout.sessions.create({
      customer: customerId,
      payment_method_configuration: cardConfiguration,
      client_reference_id: user.id,
      metadata,
      success_url: `${siteUrl}/start-membership?subscribed=1`,
      cancel_url: `${siteUrl}${returnTo === "trial_expired" ? "/trial-expired" : "/start-membership"}?canceled=1`,
      ...(free ? {
        mode: "setup" as const,
        currency: "eur",
        setup_intent_data: { metadata },
      } : {
        mode: "subscription" as const,
        payment_method_collection: "always" as const,
        line_items: [{ price: priceId!, quantity: 1 }],
        ...(referralCoupon ? { discounts: [{ coupon: referralCoupon }] } : { allow_promotion_codes: true }),
        subscription_data: { metadata: { ...metadata, referralCredit: referralCoupon ? "1" : "0" } },
      }),
      locale: "it",
    });

    await recordConversionEvent(AnalyticsEvent.CHECKOUT_STARTED, {
      userId: user.id,
      plan: tier,
      path: "/api/stripe/checkout",
      valueCents: Math.round(TIERS[tier].price * 100),
      properties: { checkoutSessionId: session.id },
      dedupeKey: `checkout_started:${session.id}`,
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
