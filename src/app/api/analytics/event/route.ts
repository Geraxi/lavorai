import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { AnalyticsEvent, type AnalyticsEventName } from "@/lib/analytics";
import { recordConversionEvent } from "@/lib/conversion-events";
import { analyticsLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const ALLOWED = new Set<string>(Object.values(AnalyticsEvent));

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as null | {
      name?: string;
      path?: string;
      plan?: string;
      source?: string;
      payload?: Record<string, unknown>;
    };
    if (!body?.name || !ALLOWED.has(body.name)) {
      return NextResponse.json({ ok: true });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? "unknown";
    if (!(await analyticsLimiter.limit(`event:${ip}`)).success) {
      return NextResponse.json({ ok: true });
    }

    let sid = request.cookies.get("lv_sid")?.value;
    const shouldSetSid = !sid;
    sid ??= randomBytes(12).toString("base64url");
    const session = await auth().catch(() => null);
    const properties = Object.fromEntries(
      Object.entries(body.payload ?? {}).filter(([, value]) =>
        value === null || ["string", "number", "boolean"].includes(typeof value),
      ),
    ) as Record<string, string | number | boolean | null>;

    await recordConversionEvent(body.name as AnalyticsEventName, {
      userId: session?.user?.id ?? null,
      sessionId: sid,
      path: body.path,
      plan: body.plan,
      source: body.source,
      properties,
    });

    const response = NextResponse.json({ ok: true });
    if (shouldSetSid) {
      response.cookies.set("lv_sid", sid, {
        maxAge: 365 * 24 * 3600,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }
    return response;
  } catch {
    return NextResponse.json({ ok: true });
  }
}
