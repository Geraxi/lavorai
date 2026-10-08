import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { decodeGeoHeader } from "@/lib/it-regions";
import { auth } from "@/lib/auth";
import { isTestAccount } from "@/lib/admin";
import { isAllowedBeaconOrigin, isBotUserAgent, isValidClientVisitorId } from "@/lib/bot-filter";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

/**
 * POST /api/track/view
 * Page-view beacon. Salva path/referrer/sessionId per le metriche admin.
 * Best-effort: 200 anche su errori o richieste scartate — non vogliamo disturbare la UX
 * né segnalare ai bot che sono stati filtrati.
 *
 * Scartate (non salvate): user-agent bot/vuoto, `sec-fetch-site` cross-site, Origin esterno,
 * visite degli account interni/di test.
 *
 * Visitatore: il client manda `vid` (id `v_…` persistito in localStorage). Se valido è l'id
 * della sessione (e lo rispecchiamo nel cookie `lv_sid`). Senza `vid` (client vecchio in cache)
 * si usa il cookie `lv_sid`, coniandolo se manca come prima: quegli id senza prefisso contano
 * come visitatori unici solo se tornano (≥2 hit) o hanno un userId — vedi realVisitorIds().
 */
export async function POST(request: NextRequest) {
  const ok = () => NextResponse.json({ ok: true });
  try {
    const rawUa = request.headers.get("user-agent") ?? "";
    if (isBotUserAgent(rawUa)) return ok();
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin") return ok();
    const origin = request.headers.get("origin");
    if (origin && !isAllowedBeaconOrigin(origin)) return ok();

    const body = (await request.json().catch(() => ({}))) as {
      path?: string;
      referrer?: string;
      vid?: string;
    };
    const path = (body.path ?? "").slice(0, 250);
    if (!path) return ok();

    const session = await auth().catch(() => null);
    if (isTestAccount(session?.user?.email)) return ok();
    const userId = session?.user?.id ?? null;

    const cookieStore = await cookies();
    const cookieSid = cookieStore.get("lv_sid")?.value;
    let sid: string;
    if (isValidClientVisitorId(body.vid)) sid = body.vid;
    else sid = cookieSid ?? randomBytes(12).toString("base64url");
    const setCookie = sid !== cookieSid;

    const country = request.headers.get("x-vercel-ip-country") ?? null;
    const region = decodeGeoHeader(request.headers.get("x-vercel-ip-country-region"));
    const city = decodeGeoHeader(request.headers.get("x-vercel-ip-city"));
    // 400 (era 200): alcuni bot mettono il token in coda a UA lunghi; serve per il filtro storico.
    const ua = rawUa.slice(0, 400);

    await prisma.pageView
      .create({
        data: {
          path,
          referrer: body.referrer?.slice(0, 250) ?? null,
          userId,
          sessionId: sid,
          country,
          region,
          city,
          userAgent: ua,
        },
      })
      .catch(() => void 0);

    const res = ok();
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
    return ok();
  }
}
