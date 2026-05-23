import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST /api/popups/respond
 * Body: { popupId, rating?, text?, dismissed? }
 * Registra la risposta (o il dismiss) dell'utente. Upsert su (popup,user):
 * idempotente, così il popup non riappare.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    popupId?: string;
    rating?: number;
    text?: string;
    dismissed?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const popupId = (body.popupId ?? "").trim();
  if (!popupId) {
    return NextResponse.json({ error: "popupId richiesto" }, { status: 400 });
  }

  // Verifica che il popup esista (evita FK error).
  const popup = await prisma.adminPopup.findUnique({
    where: { id: popupId },
    select: { id: true },
  });
  if (!popup) {
    return NextResponse.json({ error: "popup_not_found" }, { status: 404 });
  }

  const dismissed = body.dismissed === true;
  const rating =
    typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5
      ? Math.round(body.rating)
      : null;
  const text = (body.text ?? "").trim().slice(0, 4000) || null;

  await prisma.popupResponse.upsert({
    where: { popupId_userId: { popupId, userId: user.id } },
    create: { popupId, userId: user.id, rating, text, dismissed },
    update: { rating, text, dismissed },
  });

  return NextResponse.json({ ok: true });
}
