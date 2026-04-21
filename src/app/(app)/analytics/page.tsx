import type { Metadata } from "next";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo } from "@/components/design/company-logo";
import { Kpi } from "@/components/design/kpi";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import {
  DAILY_APPLICATIONS_30D,
  FUNNEL_DATA,
  TOP_COMPANIES,
} from "@/lib/ui-applications";

export const metadata: Metadata = { title: "Analisi" };

export default function AnalyticsPage() {
  return (
    <>
      <AppTopbar title="Analisi" breadcrumb="Lavoro" />
      <div style={{ padding: "24px 32px 80px", maxWidth: 1480, width: "100%", margin: "0 auto" }}>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.022em", margin: 0 }}
            >
              Analisi
            </h1>
            <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}>
              Come stanno andando le tue candidature · ultimi 30 giorni
            </p>
          </div>
          <div className="ds-toggle-group">
            <button type="button">7g</button>
            <button type="button" className="active">30g</button>
            <button type="button">90g</button>
          </div>
        </div>

        <div className="ds-kpi-grid">
          <Kpi
            label="Candidature"
            value="142"
            delta="+34% vs mese prec."
            up
            sparkData={DAILY_APPLICATIONS_30D}
          />
          <Kpi
            label="Tasso risposta"
            value="24%"
            delta="+6pt"
            up
            sparkData={[14, 16, 18, 19, 22, 24]}
            sparkColor="var(--primary-ds)"
          />
          <Kpi
            label="Tempo medio risposta"
            value="3.2g"
            delta="-0.8g"
            up
            mono
          />
          <Kpi
            label="ROI tempo"
            value="38h"
            delta="risparmiate"
            up
            mono
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr",
            gap: 20,
            marginBottom: 20,
          }}
        >
          <SectionCard>
            <SectionHead
              icon={<Icon name="chart" size={14} />}
              title="Funnel di conversione"
            />
            <SectionBody>
              {FUNNEL_DATA.map((f, i) => (
                <div key={f.label} style={{ marginBottom: 22 }}>
                  <div
                    className="flex justify-between"
                    style={{ marginBottom: 6, fontSize: 12.5 }}
                  >
                    <span style={{ fontWeight: 500 }}>{f.label}</span>
                    <span
                      className="mono"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {f.value} · {f.pct}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 28,
                      background: "var(--bg-sunken)",
                      borderRadius: 4,
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        width: `${f.pct}%`,
                        height: "100%",
                        background:
                          i === 0
                            ? "var(--fg)"
                            : i === FUNNEL_DATA.length - 1
                              ? "var(--primary-ds)"
                              : `color-mix(in oklch, var(--fg) ${100 - i * 18}%, var(--primary-ds))`,
                        transition: "width 0.5s",
                      }}
                    />
                  </div>
                </div>
              ))}
            </SectionBody>
          </SectionCard>

        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
            marginBottom: 20,
          }}
        >
          <SectionCard>
            <SectionHead
              icon={<Icon name="briefcase" size={14} />}
              title="Top ruoli per risposte"
            />
            <SectionBody>
              {[
                ["Senior Product Designer", 38, 72, "green"],
                ["Product Designer", 52, 58, "green"],
                ["UX Designer", 34, 44, "blue"],
                ["Design Lead", 12, 38, "amber"],
                ["UI Designer", 6, 22, "amber"],
              ].map(([role, count, pct, c]) => (
                <div key={role as string} className="ds-bar-row">
                  <span style={{ fontWeight: 500 }}>{role}</span>
                  <div className="ds-bar-track">
                    <div
                      className={`ds-bar-fill ds-bar-fill-${c}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="ds-bar-value">
                    {count} · {pct}%
                  </span>
                </div>
              ))}
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionHead
              icon={<Icon name="clock" size={14} />}
              title="Quando risponde il recruiter"
            />
            <SectionBody>
              <div className="ds-chart-bars">
                {[
                  2, 1, 1, 0, 0, 0, 1, 3, 8, 14, 12, 10, 8, 6, 9, 11, 13, 10, 7,
                  5, 4, 3, 3, 2,
                ].map((v, i) => (
                  <div
                    key={i}
                    className={`ds-chart-bar${v > 10 ? " accent" : ""}`}
                    style={{ height: `${(v / 14) * 100}%` }}
                    title={`${i}:00 · ${v} risposte`}
                  />
                ))}
              </div>
              <div className="ds-chart-x">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00</span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--fg-muted)",
                  marginTop: 16,
                }}
              >
                Picco di risposte alle{" "}
                <span className="mono" style={{ color: "var(--fg)" }}>
                  09:00–11:00
                </span>{" "}
                · invia candidature tra 07:30–08:30 per massimizzare visibilità.
              </div>
            </SectionBody>
          </SectionCard>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
          }}
        >
          <SectionCard>
            <SectionHead
              icon={<Icon name="globe" size={14} />}
              title="Performance per fonte"
            />
            <SectionBody>
              <table className="ds-tbl" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>Fonte</th>
                    <th>Inviate</th>
                    <th>Viste</th>
                    <th>Risposte</th>
                    <th>Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["LinkedIn", 68, 42, 18, 26],
                    ["Indeed", 34, 18, 6, 18],
                    ["Welcome to the Jungle", 22, 16, 8, 36],
                    ["Referral", 6, 6, 4, 67],
                    ["Siti aziendali", 12, 6, 2, 17],
                  ].map(([f, s, v, r, c]) => (
                    <tr key={f as string}>
                      <td style={{ fontWeight: 500 }}>{f}</td>
                      <td className="mono">{s}</td>
                      <td className="mono">{v}</td>
                      <td className="mono">{r}</td>
                      <td
                        className="mono"
                        style={{
                          color: (c as number) >= 30 ? "var(--primary-ds)" : "var(--fg-muted)",
                          fontWeight: 500,
                        }}
                      >
                        {c}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionHead
              icon={<Icon name="star" size={14} />}
              title="Aziende più coinvolgenti"
            />
            <SectionBody flush>
              {TOP_COMPANIES.map((c, i, arr) => (
                <div
                  key={c.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderBottom:
                      i === arr.length - 1
                        ? "none"
                        : "1px solid var(--border-ds)",
                  }}
                >
                  <CompanyLogo company={c.name} color={c.color} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--fg-muted)",
                      }}
                    >
                      {c.applications} candidature · {c.responses} risposte
                    </div>
                  </div>
                  <div className="ds-chip ds-chip-green">
                    {Math.round((c.responses / c.applications) * 100)}% risposta
                  </div>
                </div>
              ))}
            </SectionBody>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
