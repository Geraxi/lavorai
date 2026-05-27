import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

/**
 * POST /api/track/view
 * Page-view beacon. Salva path/referrer/sessionId per le metriche admin.
 * Best-effort: 200 anche su errori — non vogliamo disturbare la UX.
 * Cookie `lv_sid` (sessione anonima random, 1 anno) per stimare unici.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      path?: string;
      referrer?: string;
    };
    const path = (body.path ?? "").slice(0, 250);
    if (!path) return NextResponse.json({ ok: true });

    const cookieStore = await cookies();
    let sid = cookieStore.get("lv_sid")?.value;
    let setCookie = false;
    if (!sid) {
      sid = randomBytes(12).toString("base64url");
      setCookie = true;
    }

    const session = await auth().catch(() => null);
    const userId = session?.user?.id ?? null;
    const country = request.headers.get("x-vercel-ip-country") ?? null;
    const ua = (request.headers.get("user-agent") ?? "").slice(0, 200);

    await prisma.pageView
      .create({
        data: {
          path,
          referrer: body.referrer?.slice(0, 250) ?? null,
          userId,
          sessionId: sid,
          country,
          userAgent: ua,
        },
      })
      .catch(() => void 0);

    const res = NextResponse.json({ ok: true });
    if (setCookie) {
      res.cookies.set("lv_sid", sid, {
        maxAge: 365 * 24 * 3600,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }
    return res;
  } catch {
    return NextResponse.json({ ok: true });
  }
}
