import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ensureReferralCoupon, stripe, tierToPriceId } from "@/lib/stripe";
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

    // Prova gratuita di 7 giorni (carta richiesta, poi €/mese): una sola
    // volta per utente. Chi ha già avuto un abbonamento non la rivede.
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { proTrialUsedAt: true, stripeSubscriptionId: true, referralCredits: true } });
    const trialEligible = !fresh?.proTrialUsedAt && !fresh?.stripeSubscriptionId;
    const referralCoupon = (fresh?.referralCredits ?? 0) > 0 ? await ensureReferralCoupon(s) : null;

    const session = await s.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      payment_method_collection: "always",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(referralCoupon ? { discounts: [{ coupon: referralCoupon }] } : {}),
      success_url: `${siteUrl}/settings?subscribed=1`,
      cancel_url: `${siteUrl}/#prezzi?canceled=1`,
      ...(referralCoupon ? {} : { allow_promotion_codes: true }),
      client_reference_id: user.id, // fallback per webhook checkout.session.completed
      subscription_data: {
        metadata: { userId: user.id, tier, trial: trialEligible ? "7d" : "none", referralCredit: referralCoupon ? "1" : "0" },
        ...(trialEligible
          ? { trial_period_days: 7, trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } }
          : {}),
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
