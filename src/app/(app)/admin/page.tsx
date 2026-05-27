import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { Kpi, PageTitle } from "./_ui";

export const metadata: Metadata = { title: "Admin · Panoramica", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Admin / Panoramica — KPI top-level (utenti reali, paganti, candidature).
 * Auth gate è nel layout. Le altre sezioni vivono in sub-route /admin/*.
 */
export default async function AdminOverviewPage() {
  const now = Date.now();
  const since = (h: number) => new Date(now - h * 3600_000);

  const [allUsersLite, payingUsers, verifiedUsers, totalApps, apps7d, deliveredMonth, activeSessions, creditFailures7d] =
    await Promise.all([
      prisma.user.findMany({ select: { email: true, tier: true, emailVerified: true, createdAt: true } }),
      prisma.user.count({ where: { tier: { in: ["pro", "pro_plus"] } } }),
      prisma.user.count({ where: { emailVerified: { not: null } } }),
      prisma.application.count(),
      prisma.application.count({ where: { createdAt: { gte: since(24 * 7) } } }),
      prisma.application.count({
        where: {
          status: "success",
          submittedVia: { not: null },
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      prisma.applicationSession.count({ where: { status: { in: ["active", "auto"] } } }),
      prisma.application.count({
        where: {
          status: "failed",
          errorMessage: { contains: "credit balance", mode: "insensitive" },
          createdAt: { gte: since(24 * 7) },
        },
      }),
    ]);

  const totalUsers = allUsersLite.length;
  const realUsers = allUsersLite.filter((u) => !isTestAccount(u.email));
  const realTotal = realUsers.length;
  const realPaying = realUsers.filter((u) => u.tier === "pro" || u.tier === "pro_plus").length;
  const real24h = realUsers.filter((u) => u.createdAt >= since(24)).length;
  const real7d = realUsers.filter((u) => u.createdAt >= since(24 * 7)).length;
  const real30d = realUsers.filter((u) => u.createdAt >= since(24 * 30)).length;

  return (
    <>
      <PageTitle title="Panoramica" sub={`Live · ${new Date().toLocaleString("it-IT")}`} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
        <Kpi label="Utenti reali" value={realTotal} sub={`${totalUsers} totali · ${totalUsers - realTotal} test esclusi`} tone={realTotal > 0 ? "good" : undefined} />
        <Kpi label="Reali: 24h / 7g / 30g" value={`${real24h} / ${real7d} / ${real30d}`} />
        <Kpi
          label="Paganti (reali)"
          value={realPaying}
          sub={realPaying === 0 ? "nessuna conversione" : `${Math.round((realPaying / Math.max(1, realTotal)) * 100)}% conversion`}
          tone={realPaying > 0 ? "good" : "warn"}
        />
        <Kpi label="Candidature totali" value={totalApps} sub={`${apps7d} ultimi 7g`} />
        <Kpi label="Consegnate (mese)" value={deliveredMonth} />
        <Kpi label="Sessioni attive" value={activeSessions} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginBottom: 20 }}>
        Verificati totali: {verifiedUsers}/{totalUsers} · Paganti totali (incl. interni): {payingUsers}
      </div>

      {creditFailures7d > 0 && (
        <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.4)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fca5a5" }}>
            🚨 Crediti AI esauriti — pipeline bloccata
          </div>
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 6, lineHeight: 1.6 }}>
            {creditFailures7d} candidature fallite negli ultimi 7g per crediti.
            Azione: console.anthropic.com → Billing.
          </div>
        </div>
      )}
    </>
  );
}
