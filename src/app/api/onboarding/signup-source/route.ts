import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Schema = z.object({
  source: z.enum(["google", "chatgpt", "linkedin", "instagram_tiktok", "amico", "universita", "categorie_protette", "altro"]),
});

/** Optional attribution collected after account creation, never at the signup gate. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });
  await prisma.user.updateMany({
    where: { id: user.id, signupSource: null },
    data: { signupSource: parsed.data.source },
  });
  return NextResponse.json({ ok: true });
}
