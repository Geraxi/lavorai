import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe, priceIdToTier } from "@/lib/stripe";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Stripe webhook — gestisce eventi subscription lifecycle.
 * In prod: configura endpoint su dashboard Stripe, aggiungi
 * STRIPE_WEBHOOK_SECRET a .env.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET mancante.");
    return NextResponse.json(
      { error: "not_configured" },
      { status: 503 },
    );
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "no_signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("[stripe/webhook] signature invalid", err);
    return NextResponse.json(
      { error: "invalid_signature" },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // Belt-and-suspenders: fires appena il pagamento va a buon fine,
        // PRIMA di customer.subscription.created. Se per qualche motivo
        // (endpoint config incompleta, race, filtro eventi) l'evento
        // subscription non arriva, questo garantisce comunque l'upgrade.
        const sess = event.data.object as Stripe.Checkout.Session;
        if (sess.mode !== "subscription" || sess.payment_status !== "paid") break;
        const customerId =
          typeof sess.customer === "string" ? sess.customer : sess.customer?.id;
        const subscriptionId =
          typeof sess.subscription === "string"
            ? sess.subscription
            : sess.subscription?.id;
        const userId = sess.client_reference_id ?? undefined;
        if (!customerId || !subscriptionId) break;

        // Recupera la subscription per leggere price/status/period_end.
        const sub = await stripe().subscriptions.retrieve(subscriptionId);
        const item = sub.items.data[0];

        // Se il customer aveva già un'altra subscription viva (doppio checkout),
        // cancelliamo la vecchia subito: mai due addebiti per lo stesso utente.
        try {
          const others = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 10 });
          for (const o of others.data) {
            if (o.id !== sub.id && ["active", "trialing", "past_due", "unpaid"].includes(o.status)) {
              await stripe().subscriptions.cancel(o.id, { prorate: true });
              console.warn(`[stripe/webhook] cancellata subscription duplicata ${o.id} per customer ${customerId}`);
            }
          }
        } catch (e) {
          console.error("[stripe/webhook] dedupe subscriptions failed", e);
        }
        const priceId = item?.price.id;
        const tier = priceId ? priceIdToTier(priceId) ?? "free" : "free";
        const anyItem = item as unknown as { current_period_end?: number };
        const anySub = sub as unknown as { current_period_end?: number };
        const periodEndTs = anyItem?.current_period_end ?? anySub.current_period_end;

        // Match utente: prima per stripeCustomerId, poi per client_reference_id
        // (fallback se il customer non era ancora persistito lato nostro).
        const matched = await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            stripeSubscriptionId: sub.id,
            stripePriceId: priceId ?? null,
            subscriptionStatus: sub.status,
            tier: sub.status === "active" || sub.status === "trialing" ? tier : "free",
            currentPeriodEnd: periodEndTs ? new Date(periodEndTs * 1000) : null,
          },
        });
        if (matched.count === 0 && userId) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub.id,
              stripePriceId: priceId ?? null,
              subscriptionStatus: sub.status,
              tier: sub.status === "active" || sub.status === "trialing" ? tier : "free",
              currentPeriodEnd: periodEndTs ? new Date(periodEndTs * 1000) : null,
            },
          }).catch((err) => console.error("[stripe/webhook] fallback update failed", err));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const item = sub.items.data[0];
        const priceId = item?.price.id;
        const tier = priceId ? priceIdToTier(priceId) ?? "free" : "free";
        const anyItem = item as unknown as { current_period_end?: number };
        const anySub = sub as unknown as { current_period_end?: number };
        const periodEndTs = anyItem?.current_period_end ?? anySub.current_period_end;

        // Fallback userId da metadata (settato al checkout come
        // subscription_data.metadata.userId) — se nessun user matcha
        // per stripeCustomerId, promuove per metadata.
        const metaUserId = (sub.metadata?.userId as string | undefined) ?? undefined;

        const matched = await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            stripeSubscriptionId: sub.id,
            stripePriceId: priceId ?? null,
            subscriptionStatus: sub.status,
            tier: sub.status === "active" || sub.status === "trialing" ? tier : "free",
            currentPeriodEnd: periodEndTs ? new Date(periodEndTs * 1000) : null,
          },
        });
        if (matched.count === 0 && metaUserId) {
          await prisma.user.update({
            where: { id: metaUserId },
            data: {
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub.id,
              stripePriceId: priceId ?? null,
              subscriptionStatus: sub.status,
              tier: sub.status === "active" || sub.status === "trialing" ? tier : "free",
              currentPeriodEnd: periodEndTs ? new Date(periodEndTs * 1000) : null,
            },
          }).catch((err) => console.error("[stripe/webhook] metadata fallback failed", err));
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            tier: "free",
            subscriptionStatus: "canceled",
            stripeSubscriptionId: null,
            stripePriceId: null,
          },
        });
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId =
          typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (customerId) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: "past_due" },
          });
          // Dunning: avvisiamo l'utente con il link al portale per aggiornare
          // la carta (Stripe ritenta da solo, ma senza carta valida perde il piano).
          const u = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { email: true, name: true } });
          if (u?.email && process.env.RESEND_API_KEY) {
            try {
              const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
              const portal = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${siteUrl}/settings` });
              const { Resend } = await import("resend");
              const { sendWithinQuota } = await import("@/lib/email-quota");
              const amount = inv.amount_due ? `${(inv.amount_due / 100).toFixed(2).replace(".", ",")} €` : "";
              await sendWithinQuota("payment_failed", u.email, async () => {
                await new Resend(process.env.RESEND_API_KEY).emails.send({
                  from: process.env.EMAIL_FROM ?? "LavorAI <noreply@lavorai.it>",
                  to: u.email,
                  subject: "Pagamento non riuscito — aggiorna la carta per non perdere il piano",
                  html: `<p>Ciao${u.name ? ` ${u.name.split(" ")[0]}` : ""},</p>
<p>il rinnovo del tuo abbonamento LavorAI${amount ? ` (${amount})` : ""} non è andato a buon fine: la banca ha rifiutato la carta.</p>
<p>Stripe riproverà nei prossimi giorni, ma se la carta non è valida il piano tornerà a Free e le candidature automatiche si fermeranno.</p>
<p><a href="${portal.url}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Aggiorna la carta</a></p>
<p style="color:#666;font-size:13px">Se hai già sistemato, ignora questa email. Per qualsiasi dubbio rispondi pure qui.</p>`,
                });
              });
            } catch (e) {
              console.error("[stripe/webhook] payment_failed email error", e);
            }
          }
        }
        break;
      }
      default:
        // ignore
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] handler error", err);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}
