import { prisma } from "@/lib/db";
import { PageTitle, KpiTrendCard, compactNumber } from "@/app/(app)/admin/_ui";
import { AdminTrafficMap } from "@/components/admin-traffic-map";
import { AdminRangeSelect, rangeLabel } from "@/components/admin-range-select";
import { itRegionOf } from "@/lib/it-regions";
import { Eye, Users, UserPlus, Layers, Download } from "lucide-react";

const H = 3600_000;

/**
 * /admin/traffic — viewport-fisso:
 * header · 4 KPI · Traffico globale (lista paesi | globo) · [Top pagine | Top referrer].
 * Dati da PageView (beacon /api/track/view; esclude /admin e /api).
 */
export async function AdminTraffic({ days = 7 }: { days?: number } = {}) {
  const now = Date.now();
  const since = (h: number) => new Date(now - h * H);
  // Periodo scelto (default 7g) confrontato col periodo precedente della stessa lunghezza.
  const P = days;
  const DAYS = P; // giorni nella sparkline = periodo corrente

  const dayKeys: string[] = [];
  const ds = new Date();
  ds.setHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(ds);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const [views14d, uniq7d, uniqPrev7, newUsers7, newUsersPrev7, topPaths, topReferrers, byCountry, itGeo] = await Promise.all([
    prisma.pageView.findMany({ where: { ts: { gte: since(24 * 2 * P) } }, select: { ts: true, sessionId: true } }).catch(() => [] as { ts: Date; sessionId: string }[]),
    prisma.pageView.groupBy({ by: ["sessionId"], where: { ts: { gte: since(24 * P) } } }).then((r) => r.length).catch(() => 0),
    prisma.pageView.groupBy({ by: ["sessionId"], where: { ts: { gte: since(24 * 2 * P), lt: since(24 * P) } } }).then((r) => r.length).catch(() => 0),
    prisma.user.count({ where: { createdAt: { gte: since(24 * P) } } }),
    prisma.user.count({ where: { createdAt: { gte: since(24 * 2 * P), lt: since(24 * P) } } }),
    prisma.pageView.groupBy({ by: ["path"], where: { ts: { gte: since(24 * P) } }, _count: { _all: true }, orderBy: { _count: { path: "desc" } }, take: 12 }).catch(() => [] as Array<{ path: string; _count: { _all: number } }>),
    prisma.pageView.groupBy({ by: ["referrer"], where: { ts: { gte: since(24 * P) }, referrer: { not: null } }, _count: { _all: true }, orderBy: { _count: { referrer: "desc" } }, take: 12 }).catch(() => [] as Array<{ referrer: string | null; _count: { _all: number } }>),
    prisma.pageView.groupBy({ by: ["country"], where: { ts: { gte: since(24 * P) }, country: { not: null } }, _count: { _all: true }, orderBy: { _count: { country: "desc" } }, take: 30 }).catch(() => [] as Array<{ country: string | null; _count: { _all: number } }>),
    // Regione/città delle visite italiane (geo header Vercel; null per le visite precedenti al tracking)
    prisma.pageView.groupBy({ by: ["region", "city"], where: { ts: { gte: since(24 * P) }, country: "IT" }, _count: { _all: true } }).catch(() => [] as Array<{ region: string | null; city: string | null; _count: { _all: number } }>),
  ]);

  // Aggregazione per regione italiana
  const regionMap = new Map<string, { key: string; name: string; lat: number; lng: number; count: number; cities: Map<string, number> }>();
  let itUnresolved = 0;
  for (const g of itGeo) {
    const n = Number((g._count as { _all: number })._all);
    const r = itRegionOf(g.region, g.city);
    if (!r) { itUnresolved += n; continue; }
    const cur = regionMap.get(r.key) ?? { key: r.key, name: r.name, lat: r.lat, lng: r.lng, count: 0, cities: new Map<string, number>() };
    cur.count += n;
    if (g.city) cur.cities.set(g.city, (cur.cities.get(g.city) ?? 0) + n);
    regionMap.set(r.key, cur);
  }
  const regions = [...regionMap.values()].sort((a, b) => b.count - a.count).map((r) => ({ key: r.key, name: r.name, lat: r.lat, lng: r.lng, count: r.count, topCities: [...r.cities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} (${n})`) }));

  const views7 = views14d.filter((v) => v.ts >= since(24 * P)).length;
  const viewsPrev7 = views14d.length - views7;
  const bucket = (dates: Date[]) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const dt of dates) {
      const k = new Date(dt).toISOString().slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };
  const viewsSeries = bucket(views14d.map((v) => v.ts));
  const uniqSeries = dayKeys.map((k) => new Set(views14d.filter((v) => new Date(v.ts).toISOString().slice(0, 10) === k).map((v) => v.sessionId)).size);
  const perSession = uniq7d > 0 ? views7 / uniq7d : 0;
  const perSessionPrev = uniqPrev7 > 0 ? viewsPrev7 / uniqPrev7 : 0;
  const dPct = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);

  // Referrer accorpati per host
  const refMap = new Map<string, number>();
  for (const r of topReferrers) {
    const k = shortenRef(r.referrer);
    refMap.set(k, (refMap.get(k) ?? 0) + r._count._all);
  }
  const refs = [...refMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const refTotal = refs.reduce((s, [, v]) => s + v, 0) || 1;
  // Normalizza: il tipo groupBy+catch confonde TS sull'unione di _count.
  const paths: Array<{ path: string; n: number }> = topPaths.map((p) => ({ path: p.path, n: Number((p._count as { _all: number })._all) }));
  const pathTotal = paths.reduce((s, p) => s + p.n, 0) || 1;
  const pathMax = paths[0]?.n ?? 1;
  const refMax = refs[0]?.[1] ?? 1;

  return (
    <div className="adm-page" style={{ gridTemplateRows: "auto auto minmax(0,1fr) auto" }}>
      <PageTitle
        title="Traffico sito"
        sub="Scopri da dove arrivano i tuoi visitatori e come interagiscono con la piattaforma."
        actions={
          <>
            <AdminRangeSelect value={P} />
            <a href={`/api/admin/traffic-export?range=${P}`} className="adm-btn" download><Download size={13} />Esporta CSV</a>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
        <KpiTrendCard label="Page views" value={compactNumber(views7)} delta={dPct(views7, viewsPrev7)} series={viewsSeries} color="hsl(var(--primary))" icon={<Eye size={15} />} />
        <KpiTrendCard label="Visitatori unici" value={compactNumber(uniq7d)} delta={dPct(uniq7d, uniqPrev7)} series={uniqSeries} color="hsl(var(--primary))" icon={<Users size={15} />} />
        <KpiTrendCard label="Nuovi utenti" value={compactNumber(newUsers7)} delta={dPct(newUsers7, newUsersPrev7)} series={uniqSeries.map((v) => v * 0.3)} color="hsl(var(--primary))" icon={<UserPlus size={15} />} />
        <KpiTrendCard label="Pagine per sessione" value={perSession.toFixed(1)} delta={dPct(perSession, perSessionPrev)} series={viewsSeries.map((v, i) => (uniqSeries[i] > 0 ? v / uniqSeries[i] : 0))} color="hsl(var(--primary))" icon={<Layers size={15} />} />
      </div>

      <div className="adm-card" style={{ padding: 0, position: "relative" }}>
        <AdminTrafficMap rows={byCountry.map((c) => ({ country: c.country, count: c._count._all }))} regions={regions} regionsUnresolved={itUnresolved} days={P} />
      </div>

      {/* Riga compatta: altezza fissa (~3 righe visibili, scroll per il resto) così il globo prende lo spazio. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, height: 118, minHeight: 0 }}>
        <div className="adm-card" style={{ padding: "10px 14px", minHeight: 0 }}>
          <div className="adm-card-head" style={{ marginBottom: 4 }}>
            <div className="adm-card-title" style={{ fontSize: 13 }}>Top pagine <span style={{ fontWeight: 400, color: "var(--fg-subtle)", fontSize: 11 }}>· {rangeLabel(P)}</span></div>
            <span style={{ fontSize: 10.5, color: "var(--fg-subtle)", letterSpacing: 0.3, textTransform: "uppercase" }}>Viste · %</span>
          </div>
          <div className="adm-card-body scroll" style={{ minHeight: 0 }}>
            {paths.length === 0 && <div style={{ padding: "8px 0", fontSize: 12, color: "var(--fg-subtle)" }}>Nessun dato</div>}
            {paths.map((p) => (
              <BarRow key={p.path} label={p.path} value={p.n} pct={(p.n / pathTotal) * 100} bar={(p.n / pathMax) * 100} />
            ))}
          </div>
        </div>
        <div className="adm-card" style={{ padding: "10px 14px", minHeight: 0 }}>
          <div className="adm-card-head" style={{ marginBottom: 4 }}>
            <div className="adm-card-title" style={{ fontSize: 13 }}>Top referrer <span style={{ fontWeight: 400, color: "var(--fg-subtle)", fontSize: 11 }}>· {rangeLabel(P)}</span></div>
            <span style={{ fontSize: 10.5, color: "var(--fg-subtle)", letterSpacing: 0.3, textTransform: "uppercase" }}>Visite · %</span>
          </div>
          <div className="adm-card-body scroll" style={{ minHeight: 0 }}>
            {refs.length === 0 && <div style={{ padding: "8px 0", fontSize: 12, color: "var(--fg-subtle)" }}>Tutto traffico diretto</div>}
            {refs.map(([host, n]) => (
              <BarRow key={host} label={host} value={n} pct={(n / refTotal) * 100} bar={(n / refMax) * 100} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BarRow({ label, value, pct, bar }: { label: string; value: number; pct: number; bar: number }) {
  return (
    <div className="adm-tr" style={{ gridTemplateColumns: "minmax(0,1fr) 44px 36px 1fr", padding: "3px 0", fontSize: 12, gap: 8, borderBottom: "none" }}>
      <div className="adm-ellipsis" style={{ color: "var(--fg)" }}>{label}</div>
      <div className="adm-num" style={{ textAlign: "right", color: "var(--fg)" }}>{value.toLocaleString("it-IT")}</div>
      <div className="adm-num" style={{ textAlign: "right", color: "hsl(var(--primary))", fontWeight: 700 }}>{Math.round(pct)}%</div>
      <div style={{ height: 5, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden", alignSelf: "center" }}>
        <div style={{ width: `${bar}%`, height: "100%", background: "linear-gradient(90deg, hsl(var(--primary)), color-mix(in srgb, hsl(var(--primary)) 55%, transparent))", borderRadius: 3 }} />
      </div>
    </div>
  );
}

function shortenRef(ref: string | null): string {
  if (!ref) return "diretto";
  try {
    return new URL(ref).hostname.replace(/^www\./, "");
  } catch {
    return ref.length > 32 ? ref.slice(0, 31) + "…" : ref;
  }
}
