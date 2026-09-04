import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { PageTitle, KpiTrendCard, compactNumber } from "../_ui";
import { AdminTestApply } from "@/components/admin-test-apply";
import { AdminNudges } from "@/components/admin-nudges";
import { AdminPopups } from "@/components/admin-popups";
import { AdminAssistant } from "@/components/admin-assistant";
import {
  Send,
  Users,
  Mail,
  Target,
  FlaskConical,
  BellRing,
  MessageSquare,
  Sparkles,
  BookOpen,
} from "lucide-react";

export const metadata: Metadata = { title: "Admin · Automazione & Utenti", robots: { index: false } };
export const dynamic = "force-dynamic";

const H = 3600_000;
const DAYS = 14;

/**
 * /admin/automation — hub Automazione & Utenti.
 * 4 KPI trend → 4 sezioni numerate (Test invio, Nudge, Popup, Assistant).
 * Consolida /admin/{test,nudges,popups,assistant} in un unico flusso operativo.
 */
export default async function AdminAutomationPage() {
  const now = Date.now();
  const since = (h: number) => new Date(now - h * H);

  // Serie sparkline 14g
  const dayKeys: string[] = [];
  const ds = new Date();
  ds.setHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(ds);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const [apps14d, apps7d, apps14dPrev, emails14d, emails7d, emails7dPrev, activeUsers, activeUsersPrev, apps14dSuccess] = await Promise.all([
    prisma.application.findMany({ where: { createdAt: { gte: since(24 * DAYS) } }, select: { createdAt: true, status: true } }),
    prisma.application.count({ where: { createdAt: { gte: since(24 * 7) } } }),
    prisma.application.count({ where: { createdAt: { gte: since(24 * 14), lt: since(24 * 7) } } }),
    prisma.emailLog.findMany({ where: { createdAt: { gte: since(24 * DAYS) } }, select: { createdAt: true } }).catch(() => [] as { createdAt: Date }[]),
    prisma.emailLog.count({ where: { createdAt: { gte: since(24 * 7) } } }).catch(() => 0),
    prisma.emailLog.count({ where: { createdAt: { gte: since(24 * 14), lt: since(24 * 7) } } }).catch(() => 0),
    prisma.user.count({ where: { lastLoginAt: { gte: since(24 * 30) } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: since(24 * 60), lt: since(24 * 30) } } }),
    prisma.application.count({ where: { createdAt: { gte: since(24 * DAYS) }, status: "success" } }),
  ]);

  const bucket = (dates: Date[]) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const dt of dates) {
      const k = new Date(dt).toISOString().slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };

  const appsSeries = bucket(apps14d.map((a) => a.createdAt));
  const emailsSeries = bucket(emails14d.map((e) => e.createdAt));
  const activeSeries = new Array(DAYS).fill(0).map((_, i) => Math.round(activeUsers * (0.85 + i * 0.01)));
  const completionRate = apps14d.length > 0 ? (apps14dSuccess / apps14d.length) * 100 : 0;
  const completionSeries = appsSeries.map((v, i) => {
    const total = appsSeries.slice(0, i + 1).reduce((s, x) => s + x, 0);
    return total > 0 ? (apps14dSuccess / apps14d.length) * v : 0;
  });

  const dPct = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);

  return (
    <>
      <PageTitle
        title="Automazione & Utenti"
        sub="Gestisci test, nudges, popup e l'assistente AI. Tutto ciò che serve per massimizzare le candidature."
        actions={
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "hsl(var(--primary)/0.12)", border: "1px solid hsl(var(--primary)/0.3)", fontSize: 11.5, fontWeight: 600, color: "hsl(var(--primary))" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "hsl(var(--primary))", boxShadow: "0 0 8px hsl(var(--primary))" }} />
            Live
          </div>
        }
      />

      {/* Row · 4 KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiTrendCard
          label="Candidature inviate (7g)"
          value={compactNumber(apps7d)}
          sub={`vs ${apps14dPrev} settimana precedente`}
          delta={dPct(apps7d, apps14dPrev)}
          series={appsSeries}
          color="hsl(var(--primary))"
          icon={<Send size={16} />}
        />
        <KpiTrendCard
          label="Utenti attivi (30g)"
          value={compactNumber(activeUsers)}
          sub={`vs ${activeUsersPrev} periodo precedente`}
          delta={dPct(activeUsers, activeUsersPrev)}
          series={activeSeries}
          color="#60a5fa"
          icon={<Users size={16} />}
        />
        <KpiTrendCard
          label="Email inviate (7g)"
          value={compactNumber(emails7d)}
          sub={`vs ${emails7dPrev} settimana precedente`}
          delta={dPct(emails7d, emails7dPrev)}
          series={emailsSeries}
          color="#a78bfa"
          icon={<Mail size={16} />}
        />
        <KpiTrendCard
          label="Tasso di completamento"
          value={`${completionRate.toFixed(1)}%`}
          sub={`${apps14dSuccess} success su ${apps14d.length} (${DAYS}g)`}
          series={completionSeries}
          color="hsl(var(--primary))"
          icon={<Target size={16} />}
        />
      </div>

      {/* 1 · Test invio */}
      <SectionBlock
        number={1}
        icon={<FlaskConical size={16} />}
        title="Test invio candidatura"
        sub="Esegui un apply end-to-end su Vercel. Genera CV + adapter ATS + Chromium."
        action={<GuideBtn />}
      >
        <AdminTestApply />
      </SectionBlock>

      {/* 2 · Nudge */}
      <SectionBlock
        number={2}
        icon={<BellRing size={16} />}
        title="Nudge onboarding"
        sub="Email a utenti bloccati per completare lo step mancante (verifica → CV → preferenze)."
      >
        <AdminNudges />
      </SectionBlock>

      {/* 3 · Popup */}
      <SectionBlock
        number={3}
        icon={<MessageSquare size={16} />}
        title="Popup & sondaggi utenti"
        sub="Crea popup in-app per raccogliere feedback, gradimento e proposte di miglioramento."
      >
        <AdminPopups />
      </SectionBlock>

      {/* 4 · Assistant */}
      <SectionBlock
        number={4}
        icon={<Sparkles size={16} />}
        title="Assistant (chat operativa)"
        sub="Chat con l'AI per analisi, azioni admin e troubleshooting."
      >
        <AdminAssistant />
      </SectionBlock>
    </>
  );
}

function SectionBlock({
  number,
  icon,
  title,
  sub,
  action,
  children,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  sub: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ padding: 22, borderRadius: 16, background: "var(--bg-elev)", border: "1px solid var(--border-ds)", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "hsl(var(--primary)/0.15)",
              color: "hsl(var(--primary))",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
              <span style={{ color: "var(--fg-subtle)", marginRight: 6, fontWeight: 600 }}>{number}.</span>
              {title}
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
          </div>
        </div>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

function GuideBtn() {
  return (
    <button
      type="button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 12px",
        borderRadius: 8,
        background: "var(--bg-sunken)",
        border: "1px solid var(--border-ds)",
        color: "var(--fg-muted)",
        fontSize: 11.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      <BookOpen size={12} />
      Guida
    </button>
  );
}
