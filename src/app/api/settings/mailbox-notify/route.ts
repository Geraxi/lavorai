import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const Schema = z.object({
  mailboxNotifyMode: z.enum(["priority", "digest", "off"]),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  const { mailboxNotifyMode } = parsed.data;
  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id, mailboxNotifyMode },
    update: { mailboxNotifyMode },
  });
  return NextResponse.json({ ok: true, mailboxNotifyMode });
}
