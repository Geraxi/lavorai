import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Gestione abbonamento dalle Impostazioni (senza passare dal portale Stripe).
 *
 * GET  → stato: status, cancelAtPeriodEnd, pausedUntil, currentPeriodEnd, sconto attivo.
 * POST → { action, reason?, foundViaUs?, comment?, months? }
 *   cancel            cancellazione a fine periodo (il piano resta attivo fino ad allora)
 *   undo_cancel       annulla la cancellazione programmata
 *   pause             pausa 1-3 mesi (Stripe pause_collection, niente addebiti; piano sospeso)
 *   resume            riprende subito
 *   discount          applica lo sconto "resta con noi" (30% per 3 mesi) invece di cancellare
 * Ogni azione viene registrata in SubscriptionEvent con il motivo dichiarato.
 */

const RETENTION_COUPON_ID = "LAVORAI-RESTA-30";
const REASONS = new Set(["too_expensive", "found_job", "not_useful", "technical", "other"]);

async function ensureRetentionCoupon(s: Stripe): Promise<string> {
  try {
    await s.coupons.retrieve(RETENTION_COUPON_ID);
  } catch {
    await s.coupons.create({ id: RETENTION_COUPON_ID, percent_off: 30, duration: "repeating", duration_in_months: 3, name: "Resta con noi · -30% per 3 mesi" });
  }
  return RETENTION_COUPON_ID;
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  const item = sub.items.data[0] as unknown as { current_period_end?: number } | undefined;
  const legacy = sub as unknown as { current_period_end?: number };
  const ts = item?.current_period_end ?? legacy.current_period_end;
  return ts ? new Date(ts * 1000) : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!user.stripeSubscriptionId) return NextResponse.json({ subscription: null });
  try {
    const sub = await stripe().subscriptions.retrieve(user.stripeSubscriptionId, { expand: ["discounts"] });
    // Le versioni recenti dell'API espongono il coupon in discount.source.coupon,
    // le precedenti in discount.coupon: leggiamo entrambe.
    const discount = (sub as unknown as { discounts?: Array<Record<string, unknown> | string> }).discounts?.[0];
    const d = discount && typeof discount !== "string" ? discount : null;
    const coupon = (d?.coupon ?? (d?.source as { coupon?: unknown } | undefined)?.coupon ?? null) as { percent_off?: number | null; name?: string | null } | null;
    return NextResponse.json({
      subscription: {
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        pausedUntil: sub.pause_collection?.resumes_at ? new Date(sub.pause_collection.resumes_at * 1000).toISOString() : null,
        paused: !!sub.pause_collection,
        currentPeriodEnd: periodEnd(sub)?.toISOString() ?? null,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        discount: coupon ? { percentOff: coupon.percent_off, name: coupon.name } : null,
      },
    });
  } catch (err) {
    console.error("[stripe/subscription] GET failed", err);
    return NextResponse.json({ error: "stripe_error" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!user.stripeSubscriptionId) return NextResponse.json({ error: "no_subscription", message: "Nessun abbonamento attivo." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string; foundViaUs?: boolean; comment?: string; months?: number };
  const action = body.action ?? "";
  const reason = body.reason && REASONS.has(body.reason) ? body.reason : null;
  const comment = (body.comment ?? "").trim().slice(0, 2000) || null;
  const foundViaUs = typeof body.foundViaUs === "boolean" ? body.foundViaUs : null;
  const s = stripe();
  const subId = user.stripeSubscriptionId;

  const log = (a: string) =>
    prisma.subscriptionEvent.create({ data: { userId: user.id, action: a, reason, foundViaUs, comment } }).catch((e) => console.error("[stripe/subscription] log failed", e));

  try {
    switch (action) {
      case "cancel": {
        const sub = await s.subscriptions.update(subId, {
          cancel_at_period_end: true,
          cancellation_details: { comment: comment ?? undefined, feedback: reason === "too_expensive" ? "too_expensive" : reason === "not_useful" ? "missing_features" : reason === "technical" ? "low_quality" : reason === "found_job" ? "other" : "other" },
        });
        await prisma.user.update({ where: { id: user.id }, data: { cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd(sub) } });
        await log("cancel");
        return NextResponse.json({ ok: true, until: periodEnd(sub)?.toISOString() ?? null });
      }
      case "undo_cancel": {
        await s.subscriptions.update(subId, { cancel_at_period_end: false });
        await prisma.user.update({ where: { id: user.id }, data: { cancelAtPeriodEnd: false } });
        await log("undo_cancel");
        return NextResponse.json({ ok: true });
      }
      case "pause": {
        const months = Math.min(3, Math.max(1, Number(body.months) || 1));
        const resumesAt = new Date();
        resumesAt.setMonth(resumesAt.getMonth() + months);
        await s.subscriptions.update(subId, { pause_collection: { behavior: "void", resumes_at: Math.floor(resumesAt.getTime() / 1000) } });
        // In pausa: niente addebiti e niente piano Pro. Il webhook riallinea
        // tier/stato quando Stripe riprende gli addebiti.
        await prisma.user.update({ where: { id: user.id }, data: { pausedUntil: resumesAt, subscriptionStatus: "paused", tier: "free" } });
        await log("pause");
        return NextResponse.json({ ok: true, pausedUntil: resumesAt.toISOString() });
      }
      case "resume": {
        const sub = await s.subscriptions.update(subId, { pause_collection: "" as unknown as null });
        await prisma.user.update({ where: { id: user.id }, data: { pausedUntil: null, subscriptionStatus: sub.status, tier: user.stripePriceId ? user.tier === "free" ? "pro" : user.tier : "pro" } });
        await log("resume");
        return NextResponse.json({ ok: true });
      }
      case "discount": {
        const coupon = await ensureRetentionCoupon(s);
        await s.subscriptions.update(subId, { discounts: [{ coupon }], cancel_at_period_end: false });
        await prisma.user.update({ where: { id: user.id }, data: { cancelAtPeriodEnd: false } });
        await log("discount_accepted");
        return NextResponse.json({ ok: true, percentOff: 30, months: 3 });
      }
      case "review_clicked": {
        await log("review_clicked");
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "bad_action" }, { status: 400 });
    }
  } catch (err) {
    console.error(`[stripe/subscription] ${action} failed`, err);
    return NextResponse.json({ error: "stripe_error", message: "Operazione non riuscita, riprova o scrivici a support@lavorai.it." }, { status: 502 });
  }
}
