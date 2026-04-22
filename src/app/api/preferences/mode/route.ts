import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const Schema = z.object({
  autoApplyMode: z.enum(["off", "manual", "hybrid", "auto"]),
});

/**
 * PATCH /api/preferences/mode — toggle veloce di autoApplyMode senza
 * dover rimandare tutto il payload preferences. Usato dal bottone
 * "Pausa auto-apply" in /applications.
 */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { autoApplyMode } = parsed.data;
  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      autoApplyOn: autoApplyMode !== "off",
      autoApplyMode,
    },
    update: {
      autoApplyOn: autoApplyMode !== "off",
      autoApplyMode,
    },
  });
  return NextResponse.json({ ok: true, autoApplyMode });
}
