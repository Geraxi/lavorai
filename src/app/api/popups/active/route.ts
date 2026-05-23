import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { effectiveTier } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * GET /api/popups/active
 * Ritorna il primo popup attivo, non scaduto, che matcha il tier dell'utente
 * e a cui NON ha ancora risposto/dismissato. null se nessuno.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ popup: null });

  const tier = effectiveTier(user); // "free" | "pro" | "pro_plus"
  const now = new Date();

  // Popup attivi, non scaduti, per il pubblico giusto, dal più recente.
  const candidates = await prisma.adminPopup.findMany({
    where: {
      active: true,
      audience: { in: ["all", tier] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  if (candidates.length === 0) return NextResponse.json({ popup: null });

  // Escludi quelli a cui l'utente ha già risposto/dismissato.
  const responded = await prisma.popupResponse.findMany({
    where: { userId: user.id, popupId: { in: candidates.map((c) => c.id) } },
    select: { popupId: true },
  });
  const respondedSet = new Set(responded.map((r) => r.popupId));
  const next = candidates.find((c) => !respondedSet.has(c.id));
  if (!next) return NextResponse.json({ popup: null });

  return NextResponse.json({
    popup: {
      id: next.id,
      title: next.title,
      body: next.body,
      kind: next.kind,
      ctaLabel: next.ctaLabel,
    },
  });
}
