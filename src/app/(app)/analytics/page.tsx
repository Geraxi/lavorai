import type { Metadata } from "next";
import Link from "next/link";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { Kpi } from "@/components/design/kpi";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Analisi" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [totalApps, thisMonth, prevMonth] = await Promise.all([
    prisma.application.count({ where: { userId: user.id } }),
    prisma.application.count({
      where: { userId: user.id, createdAt: { gte: monthStart } },
    }),
    prisma.application.count({
      where: { userId: user.id, createdAt: { gte: prevMonthStart, lt: monthStart } },
    }),
  ]);

  const isEmpty = totalApps === 0;

  // Delta mese su mese reale
  const monthDelta =
    prevMonth === 0
      ? thisMonth > 0
        ? "+100% vs mese prec."
        : "—"
      : `${thisMonth >= prevMonth ? "+" : ""}${Math.round(
          ((thisMonth - prevMonth) / prevMonth) * 100,
        )}% vs mese prec.`;

  // Stima tempo risparmiato: ~15 min per candidatura
  const savedMin = totalApps * 15;
  const savedLabel =
    savedMin < 60
      ? `${savedMin}m`
      : `${Math.floor(savedMin / 60)}h${savedMin % 60 ? ` ${savedMin % 60}m` : ""}`;

  return (
    <>
      <AppTopbar title="Analisi" breadcrumb="Lavoro" />
      <div
        style={{
          padding: "24px 32px 80px",
          maxWidth: 1480,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.022em",
                margin: 0,
              }}
            >
              Analisi
            </h1>
            <p
              style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}
            >
              {isEmpty
                ? "Le tue metriche appariranno qui appena invii la prima candidatura."
                : "Come stanno andando le tue candidature · ultimi 30 giorni"}
            </p>
          </div>
        </div>

        <div className="ds-kpi-grid">
          <Kpi
            index={0}
            label="Candidature"
            value={String(totalApps)}
            delta={isEmpty ? "Nessuna ancora" : monthDelta}
            up={!isEmpty}
          />
          <Kpi
            index={1}
            label="Tasso risposta"
            value="—"
            delta="Nessuna risposta ancora"
          />
          <Kpi
            index={2}
            label="Tempo medio risposta"
            value="—"
            delta="Nessuna risposta ancora"
            mono
          />
          <Kpi
            index={3}
            label="Tempo risparmiato"
            value={isEmpty ? "0m" : savedLabel}
            delta={isEmpty ? "Attiva auto-apply" : "stima 15 min/candidatura"}
            up={!isEmpty}
            mono
          />
        </div>

        {isEmpty ? (
          <SectionCard>
            <SectionHead
              icon={<Icon name="chart" size={14} />}
              title="Nessun dato ancora"
            />
            <SectionBody>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  padding: "48px 24px",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--border-ds)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--fg-subtle)",
                    marginBottom: 4,
                  }}
                >
                  <Icon name="chart" size={22} />
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Inizia a candidarti
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--fg-muted)",
                    maxWidth: 360,
                    lineHeight: 1.5,
                  }}
                >
                  Appena invii la prima candidatura, qui vedrai funnel di
                  conversione, tasso risposta, top ruoli e performance per
                  portale.
                </div>
                <Link
                  href="/jobs"
                  className="ds-btn ds-btn-primary"
                  style={{ marginTop: 10 }}
                >
                  Apri job board <Icon name="arrow-right" size={13} />
                </Link>
              </div>
            </SectionBody>
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}
