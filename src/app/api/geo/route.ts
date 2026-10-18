import { NextResponse, type NextRequest } from "next/server";

/**
 * Same-origin region lookup for the consent banner, in Cloudflare
 * `/cdn-cgi/trace` format (`loc=IT`). The site is served by Vercel, where
 * `/cdn-cgi/trace` does not exist, so the country comes from Vercel's
 * `x-vercel-ip-country` edge header. Missing/invalid → `loc=XX` (unknown),
 * which the client treats as "consent required".
 */
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const raw = (request.headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  const loc = /^[A-Z][A-Z0-9]$/.test(raw) ? raw : "XX";
  return new NextResponse(`loc=${loc}\n`, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
    },
  });
}
