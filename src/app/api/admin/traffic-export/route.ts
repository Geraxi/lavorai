import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * GET /api/admin/traffic-export?range=7|14|30|90
 * CSV con: viste per giorno, top pagine, top referrer, paesi (periodo scelto).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const range = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("range") ?? 7) || 7));
  const since = new Date(Date.now() - range * 86400_000);
  const [views, paths, refs, countries] = await Promise.all([
    prisma.pageView.findMany({ where: { ts: { gte: since } }, select: { ts: true, sessionId: true } }),
    prisma.pageView.groupBy({ by: ["path"], where: { ts: { gte: since } }, _count: { _all: true }, orderBy: { _count: { path: "desc" } }, take: 100 }),
    prisma.pageView.groupBy({ by: ["referrer"], where: { ts: { gte: since }, referrer: { not: null } }, _count: { _all: true }, orderBy: { _count: { referrer: "desc" } }, take: 100 }),
    prisma.pageView.groupBy({ by: ["country"], where: { ts: { gte: since }, country: { not: null } }, _count: { _all: true }, orderBy: { _count: { country: "desc" } }, take: 100 }),
  ]);

  const byDay = new Map<string, { views: number; sessions: Set<string> }>();
  for (const v of views) {
    const k = v.ts.toISOString().slice(0, 10);
    const d = byDay.get(k) ?? { views: 0, sessions: new Set<string>() };
    d.views++;
    if (v.sessionId) d.sessions.add(v.sessionId);
    byDay.set(k, d);
  }
  const q = (s: string | null | undefined) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push(`# LavorAI traffico — ultimi ${range} giorni — generato ${new Date().toISOString()}`);
  lines.push("sezione,chiave,viste,sessioni");
  for (const [day, d] of [...byDay.entries()].sort()) lines.push(`giorno,${day},${d.views},${d.sessions.size}`);
  for (const p of paths) lines.push(`pagina,${q(p.path)},${p._count._all},`);
  for (const r of refs) lines.push(`referrer,${q(r.referrer)},${r._count._all},`);
  for (const c of countries) lines.push(`paese,${q(c.country)},${c._count._all},`);

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lavorai-traffico-${range}g.csv"`,
    },
  });
}
