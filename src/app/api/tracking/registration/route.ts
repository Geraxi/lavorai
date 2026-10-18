import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";
import { claimRegistrationConversion } from "@/lib/registration-conversion";

/**
 * One-shot claim of the signed-in user's registration conversion. See
 * src/lib/registration-conversion.ts. The response never contains PII: only
 * the opaque eventId, and only when it may be sent to Meta right now.
 */
export const runtime = "nodejs";

const ClaimSchema = z.object({ advertising: z.boolean() }).strict();

export async function POST(request: NextRequest) {
  if (!checkOrigin(request)) return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ClaimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });
  try {
    const { eventId } = await claimRegistrationConversion(prisma, userId, parsed.data.advertising);
    return NextResponse.json({ eventId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.warn("[/api/tracking/registration] claim failed", {
      code: error && typeof error === "object" && "code" in error ? (error as { code: unknown }).code : "unknown",
    });
    // Fail closed: no event. Returning 200 marks the session as claimed so
    // the client does not hammer a missing table on every page.
    return NextResponse.json({ eventId: null }, { headers: { "cache-control": "no-store" } });
  }
}
