import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authLimiter } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

/**
 * Helper per UI login: sapere se un email ha un account con password
 * ma emailVerified null. Solo per messaggi UX utili.
 *
 * Risponde sempre 200. Se l'email non è registrata o è già verificata
 * ritorna { needsVerify: false } (nessuna enumeration possibile — stessa
 * risposta sia per "non registrato" che "già verificato").
 */
export async function POST(request: NextRequest) {
  if (!checkOrigin(request)) {
    return NextResponse.json({ needsVerify: false });
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await authLimiter.limit(`verify-status-ip:${ip}`);
  if (!rl.success) return NextResponse.json({ needsVerify: false });

  const body = await request.json().catch(() => null);
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email() })
    .safeParse(body);
  if (!parsed.success) return NextResponse.json({ needsVerify: false });

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { passwordHash: true, emailVerified: true },
  });
  const needsVerify = Boolean(user?.passwordHash && !user.emailVerified);
  return NextResponse.json({ needsVerify });
}
