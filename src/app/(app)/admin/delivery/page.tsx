import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import {
  PageTitle,
  KpiTrendCard,
  LineChart,
  Donut,
  Panel,
  compactNumber,
} from "../_ui";
import {
  Send,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Download,
  Copy,
} from "lucide-react";

export const metadata: Metadata = { title: "Admin · Consegna", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAYS = 14;
const H = 3600_000;

/**
 * /admin/consegna — dashboard verità sulla consegna.
 * Struttura: 4 KPI trend → Funnel + Portal breakdown → Line chart + Donut cause → Log.
 * "Confermate" = submitConfirmation.startsWith("DETECTED_") (prova hard).
 */
export default async function AdminDeliveryPage() {
  const now = Date.now();
  const since = (h: number) => new Date(now - h * H);

  const dayKeys: string[] = [];
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(dayStart);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const labels = dayKeys.map((k) => {
    const [, m, d] = k.split("-");
    return `${d}/${m}`;
  });

  const [apps14d, apps28d, byPortal, failedRecent] = await Promise.all([
    prisma.application.findMany({
      where: { createdAt: { gte: since(24 * DAYS) } },
      select: {
        createdAt: true,
        status: true,
        portal: true,
        submitConfirmation: true,
        errorMessage: true,
      },
    }),
    prisma.application.findMany({
      where: { createdAt: { gte: since(24 * DAYS * 2), lt: since(24 * DAYS) } },
      select: { status: true, submitConfirmation: true },
    }),
    prisma.application.groupBy({
      by: ["portal"],
      where: { createdAt: { gte: since(24 * DAYS) } },
      _count: { _all: true },
    }),
    prisma.application.findMany({
      where: {
        status: "failed",
        errorMessage: { not: null },
        createdAt: { gte: since(24 * 3) },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { createdAt: true, portal: true, errorMessage: true },
    }),
  ]);

  // ── Metriche funnel ───────────────────────────────────────────────────
  const tentate = apps14d.length;
  const inviate = apps14d.filter((a) => a.status !== "queued" && a.status !== "ready_to_apply" && a.status !== "awaiting_consent").length;
  const rilevate = apps14d.filter((a) => !!a.submitConfirmation).length;
  const confermate = apps14d.filter((a) => a.submitConfirmation?.startsWith("DETECTED")).length;
  const nonConfermate = apps14d.filter((a) => a.status === "success" && (!a.submitConfirmation || a.submitConfirmation === "UNCONFIRMED")).length;
  const rate = tentate > 0 ? (confermate / tentate) * 100 : 0;

  // ── Previous window per delta % ───────────────────────────────────────
  const prevTentate = apps28d.length;
  const prevConfermate = apps28d.filter((a) => a.submitConfirmation?.startsWith("DETECTED")).length;
  const prevRate = prevTentate > 0 ? (prevConfermate / prevTentate) * 100 : 0;
  const prevNon = apps28d.filter((a) => a.status === "success" && (!a.submitConfirmation || a.submitConfirmation === "UNCONFIRMED")).length;

  const dPct = (curr: number, prev: number) => (prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100);

  // ── Serie giornaliere ────────────────────────────────────────────────
  const bucket = (rows: Array<{ createdAt: Date }>) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const r of rows) {
      const k = new Date(r.createdAt).toISOString().slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };
  const seriesTentate = bucket(apps14d);
  const seriesConfermate = bucket(apps14d.filter((a) => a.submitConfirmation?.startsWith("DETECTED")));
  const seriesNon = bucket(apps14d.filter((a) => a.status === "success" && (!a.submitConfirmation || a.submitConfirmation === "UNCONFIRMED")));

  // ── Consegne per portale ─────────────────────────────────────────────
  const portalRows = byPortal
    .map((p) => {
      const inPortal = apps14d.filter((a) => a.portal === p.portal);
      const conf = inPortal.filter((a) => a.submitConfirmation?.startsWith("DETECTED")).length;
      const rate = inPortal.length > 0 ? (conf / inPortal.length) * 100 : 0;
      return { portal: p.portal || "sconosciuto", tentate: inPortal.length, confermate: conf, rate };
    })
    .sort((a, b) => b.tentate - a.tentate);

  // ── Cause non conferma ───────────────────────────────────────────────
  const causeBuckets: Record<string, number> = {
    "AI temporaneamente non disponibile": 0,
    "Form non trovato / cambiato": 0,
    "Campi mancanti / non validi": 0,
    "Errore HTTP (4xx/5xx)": 0,
    "Captcha / anti-bot": 0,
    "Altre cause": 0,
  };
  for (const a of apps14d) {
    if (a.submitConfirmation?.startsWith("DETECTED")) continue;
    if (a.status !== "failed" && a.status !== "success") continue;
    const raw = (a.errorMessage ?? "").toLowerCase();
    if (!raw && a.status === "failed") {
      causeBuckets["Altre cause"]++;
      continue;
    }
    if (!raw) continue;
    if (/credit balance|crediti esauriti|overload|rate limit|anthropic|timeout.*ai/i.test(raw)) causeBuckets["AI temporaneamente non disponibile"]++;
    else if (/form not found|no form|selector.*not.*found|apply button|not_found_error/i.test(raw)) causeBuckets["Form non trovato / cambiato"]++;
    else if (/required|missing field|invalid_request|validation/i.test(raw)) causeBuckets["Campi mancanti / non validi"]++;
    else if (/4\d\d|5\d\d|http error|network|fetch failed/i.test(raw)) causeBuckets["Errore HTTP (4xx/5xx)"]++;
    else if (/captcha|bot|cloudflare|challenge/i.test(raw)) causeBuckets["Captcha / anti-bot"]++;
    else causeBuckets["Altre cause"]++;
  }
  const causeColors: Record<string, string> = {
    "AI temporaneamente non disponibile": "#f87171",
    "Form non trovato / cambiato": "#fbbf24",
    "Campi mancanti / non validi": "#60a5fa",
    "Errore HTTP (4xx/5xx)": "#a78bfa",
    "Captcha / anti-bot": "var(--fg-muted)",
    "Altre cause": "var(--bg-sunken)",
  };
  const causeSegments = Object.entries(causeBuckets)
    .filter(([, v]) => v > 0)
    .map(([label, value]) => ({ label, value, color: causeColors[label] }));
  const causeTotal = causeSegments.reduce((s, x) => s + x.value, 0);

  // ── Classificazione errori recenti (per la tabella) ──────────────────
  const classify = (msg: string): { type: string; tone: string } => {
    const m = msg.toLowerCase();
    if (/credit balance|crediti|anthropic|overload/i.test(m)) return { type: "credit_error", tone: "#f87171" };
    if (/not_found_error|form.*not.*found|apply button/i.test(m)) return { type: "not_found_error", tone: "#f87171" };
    if (/invalid|missing|validation/i.test(m)) return { type: "invalid_request", tone: "#fbbf24" };
    if (/timeout/i.test(m)) return { type: "timeout", tone: "#fbbf24" };
    if (/captcha|bot|cloudflare/i.test(m)) return { type: "captcha", tone: "#fbbf24" };
    if (/4\d\d|5\d\d|http|network/i.test(m)) return { type: "http_error", tone: "#a78bfa" };
    return { type: "unknown_error", tone: "var(--fg-muted)" };
  };

  return (
    <>
      <PageTitle
        title="Consegna"
        sub="Monitora la consegna delle candidature e verifica il corretto invio su tutti i portali."
        actions={
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 10,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              color: "var(--fg)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Download size={14} />
            Esporta report
          </button>
        }
      />

      {/* Row 1 · 4 KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiTrendCard
          label="Tasso di consegna verificata"
          value={`${rate.toFixed(1)}%`}
          sub={`Ultimi ${DAYS} giorni`}
          delta={rate - prevRate}
          series={seriesConfermate.map((c, i) => (seriesTentate[i] > 0 ? (c / seriesTentate[i]) * 100 : 0))}
          color="hsl(var(--primary))"
          icon={<Send size={16} />}
        />
        <KpiTrendCard
          label="Candidature tentate"
          value={compactNumber(tentate)}
          sub={`Su tutti i portali`}
          delta={dPct(tentate, prevTentate)}
          series={seriesTentate}
          color="#a78bfa"
          icon={<FileCheck size={16} />}
        />
        <KpiTrendCard
          label="Confermate (HTTP/DOM)"
          value={compactNumber(confermate)}
          sub="submitConfirmation = DETECTED_*"
          delta={dPct(confermate, prevConfermate)}
          series={seriesConfermate}
          color="hsl(var(--primary))"
          icon={<CheckCircle2 size={16} />}
        />
        <KpiTrendCard
          label="Non confermate"
          value={compactNumber(nonConfermate)}
          sub="success ma senza prova hard"
          delta={dPct(nonConfermate, prevNon)}
          series={seriesNon}
          color="#f87171"
          icon={<AlertTriangle size={16} />}
        />
      </div>

      {/* Row 2 · Funnel + Per portale */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12, marginBottom: 20 }} className="admin-row-2">
        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Funnel di consegna</div>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginTop: 2 }}>Dal tentativo alla conferma (ultimi {DAYS} giorni)</div>
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
              Tasso di completamento{" "}
              <strong style={{ color: "hsl(var(--primary))", fontSize: 14 }}>{rate.toFixed(1)}%</strong>
            </div>
          </div>
          <FunnelVerticalBars
            steps={[
              { label: "Tentate", value: tentate, pct: 100 },
              { label: "Inviate", value: inviate, pct: tentate > 0 ? (inviate / tentate) * 100 : 0 },
              { label: "Rilevate", value: rilevate, pct: tentate > 0 ? (rilevate / tentate) * 100 : 0 },
              { label: "Confermate", value: confermate, pct: tentate > 0 ? (confermate / tentate) * 100 : 0 },
            ]}
          />
        </div>

        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Consegne per portale</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px 80px", gap: 8, fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 8, borderBottom: "1px solid var(--border-ds)" }}>
            <div>Portale</div>
            <div style={{ textAlign: "right" }}>Tentate</div>
            <div style={{ textAlign: "right" }}>Conf.</div>
            <div style={{ textAlign: "right" }}>Tasso</div>
            <div />
          </div>
          {portalRows.length === 0 ? (
            <div style={{ padding: "18px 0", textAlign: "center", color: "var(--fg-subtle)", fontSize: 12 }}>Nessun dato</div>
          ) : (
            portalRows.slice(0, 8).map((p) => (
              <div key={p.portal} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px 80px", gap: 8, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border-ds)", fontSize: 12.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <PortalBadge portal={p.portal} />
                  <span style={{ color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "capitalize" }}>{p.portal}</span>
                </div>
                <div style={{ textAlign: "right", color: "var(--fg)", fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{p.tentate}</div>
                <div style={{ textAlign: "right", color: "var(--fg-muted)", fontFeatureSettings: '"tnum"' }}>{p.confermate}</div>
                <div style={{ textAlign: "right", color: p.rate >= 90 ? "hsl(var(--primary))" : p.rate >= 70 ? "#fbbf24" : "#f87171", fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                  {p.rate.toFixed(1)}%
                </div>
                <div style={{ height: 5, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${p.rate}%`, height: "100%", background: p.rate >= 90 ? "hsl(var(--primary))" : p.rate >= 70 ? "#fbbf24" : "#f87171" }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Row 3 · Line + Donut cause */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12, marginBottom: 20 }} className="admin-row-3">
        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Andamento tasso di consegna</div>
          <LineChart
            labels={labels}
            series={[
              { label: "Tentate", color: "var(--fg-muted)", data: seriesTentate },
              { label: "Confermate", color: "hsl(var(--primary))", data: seriesConfermate },
              { label: "Non confermate", color: "#f87171", data: seriesNon },
            ]}
          />
        </div>

        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Cause non conferma</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "center" }}>
            <Donut segments={causeSegments} center={{ top: causeTotal.toLocaleString("it-IT"), bottom: "Totali" }} size={140} thickness={18} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 }}>
              {causeSegments.length === 0 && <div style={{ color: "var(--fg-subtle)" }}>Nessun errore nel periodo</div>}
              {causeSegments.map((s) => {
                const pct = causeTotal > 0 ? (s.value / causeTotal) * 100 : 0;
                return (
                  <div key={s.label} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto auto", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                    <span style={{ color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                    <span style={{ color: "var(--fg)", fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{s.value}</span>
                    <span style={{ color: "var(--fg-subtle)", fontFeatureSettings: '"tnum"', minWidth: 28, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Row 4 · Errori recenti + Log tecnici */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 12, marginBottom: 20 }} className="admin-row-4">
        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Errori recenti</div>
            <a href="#" style={{ fontSize: 11.5, color: "hsl(var(--primary))", textDecoration: "none", fontWeight: 600 }}>Vedi tutti →</a>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "14px 60px 90px 1fr 1fr", gap: 10, fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 0", borderBottom: "1px solid var(--border-ds)" }}>
            <div />
            <div>Orario</div>
            <div>Portale</div>
            <div>Tipo</div>
            <div>Messaggio</div>
          </div>
          {failedRecent.length === 0 ? (
            <div style={{ padding: "18px 0", color: "var(--fg-subtle)", fontSize: 12, textAlign: "center" }}>Nessun errore recente</div>
          ) : (
            failedRecent.slice(0, 8).map((e, i) => {
              const cls = classify(e.errorMessage ?? "");
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 60px 90px 1fr 1fr", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border-ds)", fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: cls.tone, boxShadow: `0 0 5px ${cls.tone}` }} />
                  <span style={{ color: "var(--fg-muted)", fontFeatureSettings: '"tnum"' }}>{e.createdAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span style={{ color: "var(--fg)", textTransform: "capitalize" }}>{e.portal || "—"}</span>
                  <span style={{ color: cls.tone, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{cls.type}</span>
                  <span style={{ color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(e.errorMessage ?? "").split(/\n/)[0].slice(0, 80)}</span>
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Log tecnici (submitConfirmation)</div>
            <button type="button" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", color: "var(--fg-muted)", fontSize: 11, cursor: "pointer" }}>
              <Copy size={11} />
              Copia
            </button>
          </div>
          <div
            style={{
              background: "var(--bg-sunken)",
              border: "1px solid var(--border-ds)",
              borderRadius: 10,
              padding: 12,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 10.5,
              lineHeight: 1.6,
              overflow: "auto",
              maxHeight: 260,
              color: "var(--fg-muted)",
            }}
          >
            {apps14d
              .filter((a) => a.submitConfirmation || a.errorMessage)
              .slice(0, 12)
              .map((a, i) => {
                const isErr = a.status === "failed";
                const tag = isErr ? "[ERROR]" : a.submitConfirmation?.startsWith("DETECTED") ? "[INFO]" : "[WARN]";
                const tagColor = isErr ? "#f87171" : tag === "[INFO]" ? "hsl(var(--primary))" : "#fbbf24";
                const payload = {
                  type: isErr ? classify(a.errorMessage ?? "").type : a.submitConfirmation,
                  portal: a.portal,
                  status: a.status,
                };
                return (
                  <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ color: "var(--fg-subtle)" }}>{a.createdAt.toISOString().slice(0, 19).replace("T", " ")}</span>{" "}
                    <span style={{ color: tagColor, fontWeight: 700 }}>{tag}</span>{" "}
                    <span style={{ color: "var(--fg)" }}>submitConfirmation</span>{" "}
                    <span style={{ color: "hsl(var(--primary))" }}>{JSON.stringify(payload)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 1000px) { .admin-row-2, .admin-row-3, .admin-row-4 { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}

// Funnel a barre verticali (stile Shopify), con conversione fra step.
function FunnelVerticalBars({ steps }: { steps: Array<{ label: string; value: number; pct: number }> }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length * 2 - 1}, minmax(0, 1fr))`, gap: 8, alignItems: "end" }}>
      {steps.map((s, i) => {
        const h = Math.max(30, (s.value / max) * 180);
        return (
          <div key={s.label} style={{ gridColumn: `${i * 2 + 1}`, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--fg)", marginBottom: 6, letterSpacing: "-0.02em", fontFeatureSettings: '"tnum"' }}>
              {s.value.toLocaleString("it-IT")}
            </div>
            <div
              style={{
                width: "100%",
                maxWidth: 120,
                height: h,
                background: `linear-gradient(180deg, hsl(var(--primary)), color-mix(in srgb, hsl(var(--primary)) 55%, transparent))`,
                borderRadius: 8,
                boxShadow: "0 0 30px hsl(var(--primary)/0.25) inset",
              }}
            />
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "var(--fg)", fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: "hsl(var(--primary))", fontWeight: 700, marginTop: 2 }}>{s.pct.toFixed(1)}%</div>
            </div>
          </div>
        );
      })}
      {steps.slice(1).map((s, i) => {
        const drop = s.pct - steps[i].pct;
        return (
          <div key={`d-${i}`} style={{ gridColumn: `${i * 2 + 2}`, textAlign: "center", paddingBottom: 40 }}>
            <div style={{ fontSize: 11, color: drop < 0 ? "#f87171" : "hsl(var(--primary))", fontWeight: 700 }}>
              {drop >= 0 ? "+" : ""}{drop.toFixed(1)}%
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 4 }}>→</div>
          </div>
        );
      })}
    </div>
  );
}

// Badge del portale (lettera stilizzata, colorata per hash).
function PortalBadge({ portal }: { portal: string }) {
  const letter = (portal[0] ?? "?").toUpperCase();
  const colors = ["#34d399", "#60a5fa", "#a78bfa", "#fbbf24", "#f87171", "#22d3ee", "#f472b6"];
  const h = Array.from(portal).reduce((s, c) => s + c.charCodeAt(0), 0);
  const color = colors[h % colors.length];
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 5,
        background: `color-mix(in srgb, ${color} 20%, transparent)`,
        color,
        display: "grid",
        placeItems: "center",
        fontSize: 11,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}
