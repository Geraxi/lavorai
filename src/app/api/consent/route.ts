import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";
import { analyticsLimiter } from "@/lib/rate-limit";
import { isKnownNoticeVersion } from "@/lib/consent/notice";

/**
 * Append-only consent evidence. Every banner/settings answer (including a
 * withdrawal) inserts a NEW ConsentRecord; nothing is ever updated or deleted
 * here, so earlier acceptance evidence is retained.
 *
 * Stores: opaque visitor reference (random id generated in the browser, not
 * linked to the account), timestamp, notice version, region, and the
 * analytics/advertising answers. No IP, user agent, email or user id.
 */
export const runtime = "nodejs";

const Choice = z.enum(["granted", "denied"]);
const ConsentSchema = z.object({
  visitorId: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
  noticeVersion: z.string().max(64).refine(isKnownNoticeVersion),
  region: z.string().regex(/^([A-Z]{2}|unknown)$/),
  consentRequired: z.boolean(),
  analytics: Choice,
  advertising: Choice,
  action: z.enum(["accept_all", "reject_all", "save_preferences", "withdraw"]),
  source: z.enum(["banner", "settings"]),
}).strict();

export async function POST(request: NextRequest) {
  if (!checkOrigin(request)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  const rl = await analyticsLimiter.limit(`consent:${ip}`);
  if (!rl.success) return NextResponse.json({ error: "rate_limit" }, { status: 429 });

  const parsed = ConsentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });

  try {
    const record = await prisma.consentRecord.create({
      data: parsed.data,
      select: { id: true, createdAt: true },
    });
    return NextResponse.json({ ok: true, id: record.id, recordedAt: record.createdAt.toISOString() }, { status: 201 });
  } catch (error) {
    console.error("[/api/consent] insert failed", {
      code: error && typeof error === "object" && "code" in error ? (error as { code: unknown }).code : "unknown",
    });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
