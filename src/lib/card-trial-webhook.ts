import { rewardCardTrialReferralIfDue } from "@/lib/card-trial-referral";
import { isCardTrialUser } from "@/lib/card-trial-cohort";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, priceIdToTier } from "@/lib/stripe";
import { CARD_TRIAL_POLICY } from "@/lib/card-trial-policy";
import type { CardTrialEnrollment } from "@/lib/card-trial-store";
const idOf = (value: unknown): string | null => typeof value === "string" ? value : value && typeof value === "object" && "id" in value ? String(value.id) : null;

export interface VerifiedBillingSnapshot {
  status: string; paused: boolean; cardVerified: boolean; trialStart: number | null; trialEnd: number | null;
  invoicePaid: boolean; amountPaid: number; invoiceId: string | null; paidPeriodEnd: number | null;
}
/** Neither a redirect, zero-dollar trial invoice, nor `active` alone is payment. */
export function reduceCardTrialSnapshot(snapshot: VerifiedBillingSnapshot, now = Date.now()) {
  const paid = snapshot.status === "active" && !snapshot.paused && snapshot.invoicePaid
    && snapshot.amountPaid > 0 && !!snapshot.paidPeriodEnd && snapshot.paidPeriodEnd * 1000 > now;
  const trial = snapshot.status === "trialing" && !snapshot.paused && snapshot.cardVerified
    && !!snapshot.trialStart && !!snapshot.trialEnd
    && snapshot.trialEnd - snapshot.trialStart === 3 * 86400 && snapshot.trialEnd * 1000 > now;
  return { status: snapshot.paused ? "paused" : paid ? "active" : trial ? "trialing" : snapshot.status === "active" ? "payment_pending" : snapshot.status === "trialing" ? "preview_unavailable" : snapshot.status,
    paidThrough: paid ? new Date(snapshot.paidPeriodEnd! * 1000) : null, paid };
}

/** Called only after webhook signature verification. New policy events never
 * reach the legacy handler, which grants Pro for trialing subscriptions. */
export async function handleCardTrialWebhook(event: Stripe.Event): Promise<boolean> {
  const supported = event.type.startsWith("customer.subscription.") || event.type.startsWith("invoice.") || event.type === "checkout.session.completed";
  if (!supported) return false;
  const object = event.data.object as unknown as Record<string, unknown>;
  const customerId = idOf(object.customer);
  if (!customerId) return false;
  const metadata = object.metadata as Record<string, string> | undefined;
  const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true, createdAt: true } });
  if (!user) {
    if (metadata?.policy === CARD_TRIAL_POLICY) throw new Error("New trial customer has not been persisted; retry webhook");
    return false;
  }
  if (!await isCardTrialUser(user)) return false;
  const s = stripe();
  let rewardReferral = false;
  await prisma.$transaction(async tx => {
    const [row] = await tx.$queryRaw<CardTrialEnrollment[]>`SELECT * FROM "CardTrialEnrollment" WHERE "userId"=${user.id} FOR UPDATE`;
    if (!row || row.customerId !== customerId || !row.checkoutSessionId) throw new Error("New trial enrollment not ready; retry webhook");
    // Historical cash payment remains proof that a promised referral reward
    // is due, even if the subscription is later canceled or an event is replayed.
    rewardReferral = Boolean(row.firstPaidInvoiceId);
    const seen = await tx.$queryRaw<Array<{ eventId: string }>>`SELECT "eventId" FROM "CardTrialWebhookEvent" WHERE "eventId"=${event.id}`;
    if (seen.length) return;
    const session = await s.checkout.sessions.retrieve(row.checkoutSessionId);
    // An early subscription.created webhook is retried after successful checkout.
    if (session.status !== "complete" || session.mode !== "subscription" || idOf(session.customer) !== customerId || session.metadata?.policy !== CARD_TRIAL_POLICY || session.client_reference_id !== user.id) throw new Error("Card checkout has not completed");
    const subscriptionId = idOf(session.subscription);
    if (!subscriptionId) throw new Error("Subscription mismatch");
    const kind = row.checkoutKind ?? "trial";
    if (session.metadata?.attempt !== row.checkoutAttempt || (session.metadata?.checkoutKind ?? "trial") !== kind) throw new Error("Checkout attempt mismatch");
    if (row.subscriptionId && row.subscriptionId !== subscriptionId) {
      if (kind !== "paid_reactivation") throw new Error("Subscription mismatch");
      const prior = await s.subscriptions.retrieve(row.subscriptionId);
      if (idOf(prior.customer) !== customerId || prior.status !== "canceled") throw new Error("Previous subscription is not canceled");
    }
    // Disregard canceled/failed events concerning other subscriptions.
    const parent = object.parent as { subscription_details?: { subscription?: unknown } } | undefined;
    const eventSubscriptionId = event.type.startsWith("customer.subscription.") ? idOf(object)
      : event.type.startsWith("invoice.") ? idOf(parent?.subscription_details?.subscription ?? object.subscription) : idOf(object.subscription);
    if (eventSubscriptionId && eventSubscriptionId !== subscriptionId) {
      await tx.$executeRaw`INSERT INTO "CardTrialWebhookEvent" ("eventId", "userId") VALUES (${event.id}, ${user.id}) ON CONFLICT DO NOTHING`;
      return;
    }
    // Retrieve after acquiring the row lock: unordered event payloads cannot
    // restore an old status. The current Stripe object is authoritative.
    const sub = await s.subscriptions.retrieve(subscriptionId, { expand: ["default_payment_method", "latest_invoice"] });
    if (idOf(sub.customer) !== customerId || sub.metadata.policy !== CARD_TRIAL_POLICY || sub.metadata.userId !== user.id) throw new Error("Subscription ownership mismatch");
    if (sub.metadata.attempt !== row.checkoutAttempt || (sub.metadata.checkoutKind ?? "trial") !== kind) throw new Error("Subscription attempt mismatch");
    if (kind === "paid_reactivation" && sub.status === "trialing") throw new Error("Reactivation cannot start another trial");
    const pm = typeof sub.default_payment_method === "string" ? await s.paymentMethods.retrieve(sub.default_payment_method) : sub.default_payment_method;
    const invoice = typeof sub.latest_invoice === "string" ? await s.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice;
    const invoiceSub = invoice?.parent?.subscription_details?.subscription;
    const invoiceMatches = !!invoice && idOf(invoice.customer) === customerId && idOf(invoiceSub) === sub.id;
    const item = sub.items.data[0];
    const configuredTier = item ? priceIdToTier(item.price.id) : null;
    if (!configuredTier || configuredTier === "free") throw new Error("Unknown subscription price");
    // Access is bounded by service actually covered by the paid invoice,
    // never by a subscription period that may already have rolled forward.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const paidLines = invoiceMatches && !invoice.lines.has_more ? invoice.lines.data.filter(line =>
      idOf(line.parent?.subscription_item_details?.subscription) === sub.id
      && idOf(line.pricing?.price_details?.price) === item.price.id
      && line.amount > 0 && line.period.start <= nowSeconds && line.period.end > nowSeconds
    ) : [];
    const paidPeriodEnd = paidLines.length ? Math.min(...paidLines.map(line => line.period.end)) : null;
    const snapshot: VerifiedBillingSnapshot = {
      status: sub.status, paused: !!sub.pause_collection, cardVerified: pm?.type === "card",
      trialStart: sub.trial_start, trialEnd: sub.trial_end,
      invoicePaid: invoiceMatches && invoice.status === "paid", amountPaid: invoiceMatches ? invoice.amount_paid : 0,
      invoiceId: invoiceMatches ? invoice.id : null, paidPeriodEnd,
    };
    const next = reduceCardTrialSnapshot(snapshot);
    // Once used, never move the original trial boundary on any later event.
    const trialStart = row.trialStartedAt ?? (sub.trial_start ? new Date(sub.trial_start * 1000) : null);
    const trialEnd = row.trialEndsAt ?? (sub.trial_end ? new Date(sub.trial_end * 1000) : null);
    const cardVerifiedAt = row.cardVerifiedAt ?? (snapshot.cardVerified ? new Date() : null);
    const paidInvoiceId = next.paid ? snapshot.invoiceId : null;
    // Referral history is distinct from current access: a verified positive
    // payment still earns the promised reward if cancellation arrives first.
    // Retrieve an invoice event from Stripe rather than trusting its payload.
    const historicalInvoice = event.type.startsWith("invoice.") && typeof object.id === "string"
      ? await s.invoices.retrieve(object.id) : invoice;
    const historicalPaidInvoiceId = historicalInvoice
      && idOf(historicalInvoice.customer) === customerId
      && idOf(historicalInvoice.parent?.subscription_details?.subscription) === sub.id
      && historicalInvoice.status === "paid" && historicalInvoice.amount_paid > 0
      && !historicalInvoice.lines.has_more
      && historicalInvoice.lines.data.some(line =>
        idOf(line.parent?.subscription_item_details?.subscription) === sub.id
        && idOf(line.pricing?.price_details?.price) === item.price.id
        && line.amount > 0 && line.period.start <= nowSeconds && line.period.end > line.period.start)
      ? historicalInvoice.id : null;
    rewardReferral = rewardReferral || Boolean(historicalPaidInvoiceId);
    await tx.$executeRaw`UPDATE "CardTrialEnrollment" SET "subscriptionId"=${sub.id}, "tier"=${configuredTier}, "status"=${next.status}, "trialStartedAt"=${trialStart}, "trialEndsAt"=${trialEnd}, "cardVerifiedAt"=${cardVerifiedAt}, "paidThrough"=${next.paidThrough}, "paidInvoiceId"=${paidInvoiceId}, "firstPaidInvoiceId"=COALESCE("firstPaidInvoiceId", ${historicalPaidInvoiceId}), "cancelAtPeriodEnd"=${sub.cancel_at_period_end}, "updatedAt"=now() WHERE "userId"=${user.id}`;
    await tx.user.update({ where: { id: user.id }, data: {
      stripeSubscriptionId: sub.id, stripePriceId: item.price.id, subscriptionStatus: next.status,
      tier: next.paid ? configuredTier : "free", currentPeriodEnd: next.paidThrough ?? trialEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    }, select: { id: true } });
    await tx.$executeRaw`INSERT INTO "CardTrialWebhookEvent" ("eventId", "userId") VALUES (${event.id}, ${user.id})`;
  }, { timeout: 30_000 });
  // Durable reward delivery is separate from access and survives event replay.
  if (rewardReferral) await rewardCardTrialReferralIfDue(user.id);
  return true;
}
