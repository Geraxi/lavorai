import { prisma } from "@/lib/db";
import { Icon } from "@/components/design/icon";
import { AdminTrafficMap } from "@/components/admin-traffic-map";

/**
 * Pannello admin "Traffico": visite, visitatori unici (sessionId distinti),
 * pagine top. Dati dalla tabella PageView popolata dal beacon /api/track/view.
 * Esclude path /admin e /api/* (già filtrati in TrackPageView).
 */
export async function AdminTraffic() {
  const now = Date.now();
  const since = (h: number) => new Date(now - h * 3600_000);

  // Defensive: la tabella PageView potrebbe non esistere ancora subito dopo
  // il primo deploy (prisma db push gira al build). Ogni query .catch a 0/[].
  const [views24h, views7d, views30d, uniq24h, uniq7d, topPaths, topReferrers, byCountry] =
    await Promise.all([
      prisma.pageView.count({ where: { ts: { gte: since(24) } } }).catch(() => 0),
      prisma.pageView.count({ where: { ts: { gte: since(24 * 7) } } }).catch(() => 0),
      prisma.pageView.count({ where: { ts: { gte: since(24 * 30) } } }).catch(() => 0),
      prisma.pageView
        .groupBy({ by: ["sessionId"], where: { ts: { gte: since(24) } } })
        .then((r) => r.length)
        .catch(() => 0),
      prisma.pageView
        .groupBy({ by: ["sessionId"], where: { ts: { gte: since(24 * 7) } } })
        .then((r) => r.length)
        .catch(() => 0),
      prisma.pageView
        .groupBy({
          by: ["path"],
          where: { ts: { gte: since(24 * 7) } },
          _count: { _all: true },
          orderBy: { _count: { path: "desc" } },
          take: 10,
        })
        .catch(() => [] as Array<{ path: string; _count: { _all: number } }>),
      prisma.pageView
        .groupBy({
          by: ["referrer"],
          where: { ts: { gte: since(24 * 7) }, referrer: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { referrer: "desc" } },
          take: 8,
        })
        .catch(() => [] as Array<{ referrer: string | null; _count: { _all: number } }>),
      prisma.pageView
        .groupBy({
          by: ["country"],
          where: { ts: { gte: since(24 * 7) }, country: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { country: "desc" } },
          take: 8,
        })
        .catch(() => [] as Array<{ country: string | null; _count: { _all: number } }>),
    ]);

  const hasAnyData = views30d > 0;

  return (
    <section
      style={{
        padding: 18,
        borderRadius: 14,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        marginBottom: 16,
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        <Icon name="chart" size={14} /> Traffico sito
      </h2>
      <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "0 0 14px" }}>
        Page views e visitatori unici (sessione anonima). Esclude /admin e /api.
      </p>

      {!hasAnyData && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.35)",
            fontSize: 12.5,
            color: "var(--fg)",
            marginBottom: 14,
            lineHeight: 1.55,
          }}
        >
          ⏳ Tracking attivo ma ancora nessuna visita registrata. I dati
          iniziano a comparire appena qualcuno visita una pagina pubblica
          (es. <code>/</code>, <code>/proof</code>, <code>/pricing</code>).
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <Stat label="Views 24h" value={views24h} />
        <Stat label="Views 7g" value={views7d} />
        <Stat label="Views 30g" value={views30d} />
        <Stat label="Unici 24h" value={uniq24h} tone="good" />
        <Stat label="Unici 7g" value={uniq7d} tone="good" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="admin-traffic-2col">
        <Block title="Top pagine (7g)">
          {topPaths.length === 0 ? (
            <Empty />
          ) : (
            topPaths.map((p) => (
              <Row key={p.path} left={p.path} right={p._count._all.toString()} />
            ))
          )}
        </Block>
        <Block title="Top referrer (7g)">
          {topReferrers.length === 0 ? (
            <Empty hint="Tutto traffico diretto/organico" />
          ) : (
            topReferrers.map((r) => (
              <Row
                key={r.referrer ?? "?"}
                left={shortenRef(r.referrer)}
                right={r._count._all.toString()}
              />
            ))
          )}
        </Block>
      </div>

      {byCountry.length > 0 && (
        <AdminTrafficMap rows={byCountry.map((c) => ({ country: c.country, count: c._count._all }))} />
      )}

      <style>{`@media (max-width:800px){.admin-traffic-2col{grid-template-columns:1fr !important}}`}</style>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good";
}) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: "var(--bg)",
        border: "1px solid var(--border-ds)",
      }}
    >
      <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: tone === "good" ? "hsl(var(--primary))" : "var(--fg)",
          marginTop: 2,
          letterSpacing: "-0.01em",
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {title}
      </div>
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border-ds)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 12px",
        borderBottom: "1px solid var(--border-ds)",
        fontSize: 12.5,
      }}
    >
      <span style={{ color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{left}</span>
      <span className="mono" style={{ color: "var(--fg-muted)", flexShrink: 0 }}>{right}</span>
    </div>
  );
}

function Empty({ hint }: { hint?: string }) {
  return (
    <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--fg-subtle)", fontSize: 12.5 }}>
      Nessun dato {hint ? `· ${hint}` : ""}
    </div>
  );
}

function shortenRef(r: string | null): string {
  if (!r) return "—";
  try {
    return new URL(r).hostname.replace(/^www\./, "");
  } catch {
    return r.slice(0, 40);
  }
}
