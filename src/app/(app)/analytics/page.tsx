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

  const totalApps = await prisma.application.count({
    where: { userId: user.id },
  });

  const isEmpty = totalApps === 0;

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
            value={isEmpty ? "0" : String(totalApps)}
            delta={isEmpty ? "Nessuna ancora" : "+34% vs mese prec."}
            up={!isEmpty}
          />
          <Kpi
            index={1}
            label="Tasso risposta"
            value={isEmpty ? "—" : "24%"}
            delta={isEmpty ? "In attesa dati" : "+6pt"}
            up={!isEmpty}
          />
          <Kpi
            index={2}
            label="Tempo medio risposta"
            value={isEmpty ? "—" : "3.2g"}
            delta={isEmpty ? "In attesa dati" : "-0.8g"}
            up={!isEmpty}
            mono
          />
          <Kpi
            index={3}
            label="ROI tempo"
            value={isEmpty ? "0h" : "38h"}
            delta={isEmpty ? "Attiva auto-apply" : "risparmiate"}
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
