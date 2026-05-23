import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { AdminAssistant } from "@/components/admin-assistant";
import { AdminPopups } from "@/components/admin-popups";
import { AdminNudges } from "@/components/admin-nudges";

export const metadata: Metadata = { title: "Admin · LavorAI", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Dashboard admin interna. Gated a isAdmin() (founder only).
 * Server component: query Prisma dirette in parallelo, niente API.
 * Mostra: KPI, utenti, salute candidature (verità consegna), job pool,
 * email, conversioni, auto-apply.
 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) notFound();

  const now = Date.now();
  const since = (h: number) => new Date(now - h * 3600_000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    allUsersLite,
    payingUsers,
    verifiedUsers,
    recentUsers,
    appsByStatus,
    appsByConfirmation,
    appsBySubmittedVia,
    totalApps,
    apps7d,
    deliveredMonth,
    jobsBySource,
    newestJob,
    emailsByKind7d,
    activeSessions,
    autoApplyUsers,
  ] = await Promise.all([
    // Tutti gli utenti lite per calcolare metriche REALI (escludendo
    // test/interni) in JS — più affidabile di N count() con NOT-contains.
    prisma.user.findMany({ select: { email: true, tier: true, emailVerified: true, createdAt: true } }),
    prisma.user.count({ where: { tier: { in: ["pro", "pro_plus"] } } }),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        email: true, name: true, tier: true, emailVerified: true,
        createdAt: true, lastLoginAt: true,
        _count: { select: { applications: true } },
      },
    }),
    prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.application.groupBy({ by: ["submitConfirmation"], _count: { _all: true } }),
    prisma.application.groupBy({ by: ["submittedVia"], _count: { _all: true } }),
    prisma.application.count(),
    prisma.application.count({ where: { createdAt: { gte: since(24 * 7) } } }),
    prisma.application.count({ where: { status: "success", submittedVia: { not: null }, createdAt: { gte: monthStart } } }),
    prisma.job.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.job.findFirst({ orderBy: { cachedAt: "desc" }, select: { cachedAt: true, postedAt: true } }),
    prisma.emailLog.groupBy({ by: ["kind"], where: { createdAt: { gte: since(24 * 7) } }, _count: { _all: true } }),
    prisma.applicationSession.count({ where: { status: { in: ["active", "auto"] } } }),
    prisma.userPreferences.groupBy({ by: ["autoApplyMode"], _count: { _all: true } }),
  ]);

  // Metriche REALI: escludi test/interni (testmail.app, postdbpush-,
  // founder, tester). Total resta visibile per riferimento.
  const totalUsers = allUsersLite.length;
  const realUsersList = allUsersLite.filter((u) => !isTestAccount(u.email));
  const realTotal = realUsersList.length;
  const realPaying = realUsersList.filter((u) => u.tier === "pro" || u.tier === "pro_plus").length;
  const real24h = realUsersList.filter((u) => u.createdAt >= since(24)).length;
  const real7d = realUsersList.filter((u) => u.createdAt >= since(24 * 7)).length;
  const real30d = realUsersList.filter((u) => u.createdAt >= since(24 * 30)).length;
  const testCount = totalUsers - realTotal;

  // Delivery-truth: quante "success" hanno conferma HARD vs sospette
  const confMap = Object.fromEntries(
    appsByConfirmation.map((r) => [r.submitConfirmation ?? "null", r._count._all]),
  );
  const confirmedDelivered = Object.entries(confMap)
    .filter(([k]) => k.startsWith("DETECTED"))
    .reduce((s, [, v]) => s + v, 0);
  const unconfirmed = (confMap["UNCONFIRMED"] ?? 0) + (confMap["null"] ?? 0);

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
          Internal · Admin
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
          Control room
        </h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 4 }}>
          Snapshot live · {new Date().toLocaleString("it-IT")}
        </p>
      </div>

      {/* KPI ROW — metriche REALI (test/interni esclusi) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 26 }}>
        <Kpi label="Utenti reali" value={realTotal} sub={`${totalUsers} totali · ${testCount} test/interni esclusi`} tone={realTotal > 0 ? "good" : undefined} />
        <Kpi label="Reali: 24h / 7g / 30g" value={`${real24h} / ${real7d} / ${real30d}`} />
        <Kpi label="Paganti (reali)" value={realPaying} sub={realPaying === 0 ? "nessuna conversione" : `${Math.round((realPaying / Math.max(1, realTotal)) * 100)}% conversion`} tone={realPaying > 0 ? "good" : "warn"} />
        <Kpi label="Candidature totali" value={totalApps} sub={`${apps7d} ultimi 7g`} />
        <Kpi label="Consegnate (mese)" value={deliveredMonth} />
        <Kpi label="Sessioni attive" value={activeSessions} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginBottom: 22 }}>
        Verificati totali: {verifiedUsers}/{totalUsers} · Paganti totali (incl. interni): {payingUsers}
      </div>

      {/* DELIVERY TRUTH — il pezzo più importante */}
      <Panel title="🚚 Verità sulla consegna candidature">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <Kpi label="Consegna confermata (HTTP/DOM)" value={confirmedDelivered} tone={confirmedDelivered > 0 ? "good" : "warn"} />
          <Kpi label="Non confermata / sospetta" value={unconfirmed} tone={unconfirmed > 0 ? "warn" : "good"} />
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.6 }}>
          <strong>Per submitConfirmation:</strong>{" "}
          {appsByConfirmation.length === 0 ? "nessun dato" :
            appsByConfirmation.map((r) => `${r.submitConfirmation ?? "null"}: ${r._count._all}`).join(" · ")}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.6 }}>
          <strong>Per submittedVia:</strong>{" "}
          {appsBySubmittedVia.map((r) => `${r.submittedVia ?? "null"}: ${r._count._all}`).join(" · ")}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.6 }}>
          <strong>Per status:</strong>{" "}
          {appsByStatus.map((r) => `${r.status}: ${r._count._all}`).join(" · ")}
        </div>
        {confirmedDelivered === 0 && totalApps > 0 && (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", fontSize: 12.5, color: "#fca5a5" }}>
            🚨 ZERO candidature con prova hard di consegna. Il funnel di submission non sta confermando. Priorità #1.
          </div>
        )}
      </Panel>

      {/* USERS */}
      <Panel title={`👤 Utenti recenti (${recentUsers.length})`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-subtle)", borderBottom: "1px solid var(--border-ds)" }}>
                <Th>Email</Th><Th>Tier</Th><Th>Verif.</Th><Th>Candid.</Th><Th>Registrato</Th><Th>Ultimo login</Th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => {
                const test = isTestAccount(u.email);
                return (
                  <tr key={u.email} style={{ borderBottom: "1px solid var(--border-ds)", opacity: test ? 0.5 : 1 }}>
                    <Td>
                      {u.email}
                      {test && (
                        <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "var(--bg-sunken)", color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          test/interno
                        </span>
                      )}
                    </Td>
                    <Td><TierChip tier={u.tier} /></Td>
                    <Td>{u.emailVerified ? "✅" : "❌"}</Td>
                    <Td>{u._count.applications}</Td>
                    <Td>{u.createdAt.toLocaleDateString("it-IT")}</Td>
                    <Td>{u.lastLoginAt ? u.lastLoginAt.toLocaleDateString("it-IT") : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* JOB POOL */}
      <Panel title="💼 Job pool">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          {jobsBySource.map((r) => `${r.source}: ${r._count._all}`).join(" · ") || "vuoto"}
          <div style={{ marginTop: 8 }}>
            Job più recente cached: {newestJob?.cachedAt ? newestJob.cachedAt.toLocaleString("it-IT") : "—"}
            {newestJob?.cachedAt && (Date.now() - newestJob.cachedAt.getTime() > 6 * 3600e3) && (
              <span style={{ color: "#fbbf24" }}> ⚠️ &gt;6h fa — il cron sync-jobs potrebbe non girare</span>
            )}
          </div>
        </div>
      </Panel>

      {/* EMAIL + AUTO-APPLY */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="admin-2col">
        <Panel title="📧 Email inviate (7g)">
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
            {emailsByKind7d.length === 0 ? "nessuna" :
              emailsByKind7d.map((r) => `${r.kind}: ${r._count._all}`).join(" · ")}
          </div>
        </Panel>
        <Panel title="⚙️ Auto-apply mode (utenti)">
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
            {autoApplyUsers.length === 0 ? "nessuna preferenza" :
              autoApplyUsers.map((r) => `${r.autoApplyMode}: ${r._count._all}`).join(" · ")}
          </div>
        </Panel>
      </div>

      <style>{`@media (max-width:800px){.admin-2col{grid-template-columns:1fr !important}}`}</style>

      {/* Nudge onboarding agli utenti bloccati */}
      <AdminNudges />

      {/* Popup & sondaggi per gli utenti */}
      <AdminPopups />

      {/* Assistente AI admin (chat sidebar con accesso allo snapshot live) */}
      <AdminAssistant />
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "hsl(var(--primary))" : tone === "warn" ? "#fbbf24" : "var(--fg)";
  return (
    <div style={{ padding: 16, borderRadius: 12, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
      <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 4, letterSpacing: "-0.01em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)", marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "6px 10px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "7px 10px" }}>{children}</td>;
}
function TierChip({ tier }: { tier: string }) {
  const map: Record<string, { bg: string; c: string; l: string }> = {
    free: { bg: "var(--bg-sunken)", c: "var(--fg-muted)", l: "Free" },
    pro: { bg: "rgba(37,99,235,0.18)", c: "#60a5fa", l: "Pro" },
    pro_plus: { bg: "hsl(var(--primary)/0.2)", c: "hsl(var(--primary))", l: "Pro+" },
  };
  const s = map[tier] ?? map.free;
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.c }}>{s.l}</span>;
}
