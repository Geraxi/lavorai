import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { stripe, priceIdToTier } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * POST /api/admin/link-stripe
 * Body: { email: string, customerId?: string }
 * Collega un utente della piattaforma al suo customer Stripe (cercato per
 * email se non indicato) e allinea piano/stato all'abbonamento più recente
 * "vivo" (trialing/active/past_due). Serve quando un pagamento è avvenuto
 * senza che il webhook fosse registrato: l'utente ha pagato ma è rimasto Free.
 * Auth: sessione admin oppure header X-Admin-Key == ADMIN_SYNC_KEY.
 */
export async function POST(req: NextRequest) {
  const headerKey = req.headers.get("x-admin-key");
  const expected = process.env.ADMIN_SYNC_KEY;
  const me = await getCurrentUser();
  if (!((expected && headerKey === expected) || isAdmin(me?.email))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { email?: string; customerId?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });

  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, email: true, tier: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const s = stripe();
  let customerId = body.customerId?.trim();
  if (!customerId) {
    const found = await s.customers.search({ query: `email:'${email.replace(/'/g, "\\'")}'`, limit: 5 });
    customerId = found.data.sort((a, b) => a.created - b.created)[0]?.id;
  }
  if (!customerId) return NextResponse.json({ error: "stripe_customer_not_found" }, { status: 404 });

  const subs = await s.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  const rank: Record<string, number> = { active: 0, trialing: 0, past_due: 1, unpaid: 2 };
  const live = subs.data
    .filter((x) => x.status in rank)
    .sort((a, b) => (rank[a.status] - rank[b.status]) || b.created - a.created)[0];
  const priceId = live?.items.data[0]?.price.id ?? null;
  const tier = live && (live.status === "active" || live.status === "trialing") ? ((priceId && priceIdToTier(priceId)) || "pro") : user.tier;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: live?.id ?? null,
      stripePriceId: priceId,
      subscriptionStatus: live?.status ?? null,
      tier,
    },
    select: { email: true, tier: true, subscriptionStatus: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  return NextResponse.json({ ok: true, user: updated, subscriptions: subs.data.map((x) => ({ id: x.id, status: x.status })) });
}
