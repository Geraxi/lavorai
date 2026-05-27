import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ensureReferralCode, getReferralStats } from "@/lib/referral";

export const runtime = "nodejs";

/**
 * GET /api/referral/me
 * Restituisce il codice referral dell'utente loggato (creandolo lazy se manca)
 * + stats: quanti referred totali e quanti paganti.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [code, stats] = await Promise.all([
    ensureReferralCode(user.id),
    getReferralStats(user.id),
  ]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  return NextResponse.json({
    code,
    link: `${siteUrl}/signup?ref=${code}`,
    stats,
  });
}
