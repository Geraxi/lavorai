import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { PageTitle, KpiTrendCard, LineChart, ChartLegend, Donut, compactNumber, DeliveryFunnel } from "../_ui";
import { AdminRangeSelect } from "@/components/admin-range-select";
import { Send, FileCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { RetryCaptchaButton } from "../_retry-captcha-button";
import { CopyTargetButton } from "../_client-buttons";

export const metadata: Metadata = { title: "Admin · Consegna", robots: { index: false } };
export const dynamic = "force-dynamic";

const RANGES = [1, 7, 14, 30, 90];
const H = 3600_000;
const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

/**
 * /admin/delivery — Consegna, viewport-fisso.
 * header · 4 KPI · [Funnel 2/3 | Per portale] · [Andamento 2/3 | Cause] · [Errori 1.4 | Log].
 * "Confermate" = submitConfirmation DETECTED_* (prova hard).
 */
export default async function AdminDeliveryPage({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  const sp = (await searchParams) ?? {};
  const DAYS = RANGES.includes(Number(sp.range)) ? Number(sp.range) : 14;
  const now = Date.now();
  const since = (h: number) => new Date(now - h * H);

  const dayKeys: string[] = [];
  const ds = new Date();
  ds.setHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(ds);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const labels = dayKeys.map((k) => {
    const [, m, d] = k.split("-");
    return `${d} ${MONTHS[Number(m) - 1]}`;
  });

  // Domande dei form che bloccano candidature (UserAnswer senza risposta),
  // aggregate per testo: dice quali domande l'AI non sa ancora rispondere.
  const blockingQ = await prisma.userAnswer
    .groupBy({
      by: ["label"],
      where: { OR: [{ answer: null }, { answer: "" }] },
      _count: { _all: true },
      orderBy: { _count: { label: "desc" } },
      take: 8,
    })
    .catch(() => [] as Array<{ label: string; _count: { _all: number } }>);
  const waitingAuto = await prisma.application
    .count({ where: { status: "needs_answers", user: { preferences: { autoApplyMode: "auto" } } } })
    .catch(() => 0);

  const [apps14d, apps28d, failedRecent] = await Promise.all([
    prisma.application.findMany({
      where: { createdAt: { gte: since(24 * DAYS) } },
      select: { createdAt: true, status: true, portal: true, submitConfirmation: true, errorMessage: true, canaryLog: true },
    }),
    prisma.application.findMany({
      where: { createdAt: { gte: since(24 * DAYS * 2), lt: since(24 * DAYS) } },
      select: { status: true, submitConfirmation: true },
    }),
    prisma.application.findMany({
      where: { status: "failed", errorMessage: { not: null }, createdAt: { gte: since(24 * 7) } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { createdAt: true, portal: true, errorMessage: true, canaryLog: true },
    }),
  ]);

  // Consegna "provata": ATS con conferma HTTP/DOM (DETECTED_*) OPPURE email al
  // recruiter accettata dall'SMTP (EMAIL_SENT). Allineato alla Panoramica:
  // prima contavamo solo DETECTED_* → tasso 0% anche con centinaia di email
  // consegnate, perché l'invio ATS è disabilitato/dry-run in produzione.
  const isAts = (a: { submitConfirmation: string | null }) => !!a.submitConfirmation?.startsWith("DETECTED");
  const isEmail = (a: { submitConfirmation: string | null }) => a.submitConfirmation === "EMAIL_SENT";
  const isConf = (a: { submitConfirmation: string | null }) => isAts(a) || isEmail(a);
  const isUnconf = (a: { status: string; submitConfirmation: string | null }) =>
    a.status === "success" && (!a.submitConfirmation || a.submitConfirmation === "UNCONFIRMED");

  const tentate = apps14d.length;
  const inviate = apps14d.filter((a) => !["queued", "ready_to_apply", "awaiting_consent"].includes(a.status)).length;
  const rilevate = apps14d.filter((a) => !!a.submitConfirmation).length;
  const confermate = apps14d.filter(isConf).length;
  const confAts = apps14d.filter(isAts).length;
  const confEmail = apps14d.filter(isEmail).length;
  const nonConf = apps14d.filter(isUnconf).length;
  const rate = tentate > 0 ? (confermate / tentate) * 100 : 0;

  const pTentate = apps28d.length;
  const pConf = apps28d.filter(isConf).length;
  const pRate = pTentate > 0 ? (pConf / pTentate) * 100 : 0;
  const pNon = apps28d.filter(isUnconf).length;
  const dPct = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);

  const bucket = (rows: Array<{ createdAt: Date }>) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const r of rows) {
      const k = new Date(r.createdAt).toISOString().slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };
  const sTentate = bucket(apps14d);
  const sConf = bucket(apps14d.filter(isConf));
  const sNon = bucket(apps14d.filter(isUnconf));
  const sRate = sTentate.map((t, i) => (t > 0 ? Math.round((sConf[i] / t) * 100) : 0));

  // Per portale — con breakdown diagnostico dell'esito (cosa ha scritto il worker).
  type PB = { t: number; c: number; ats: number; email: number; unconf: number; dry: number; captcha: number; failed: number; wait: number };
  const portals = new Map<string, PB>();
  for (const a of apps14d) {
    const k = a.portal || "sconosciuto";
    const cur = portals.get(k) ?? { t: 0, c: 0, ats: 0, email: 0, unconf: 0, dry: 0, captcha: 0, failed: 0, wait: 0 };
    cur.t++;
    if (isConf(a)) cur.c++;
    if (isAts(a)) cur.ats++;
    else if (isEmail(a)) cur.email++;
    else if (a.submitConfirmation === "UNCONFIRMED" || a.submitConfirmation === "UNKNOWN") cur.unconf++;
    else if (a.submitConfirmation === "DRY_RUN") cur.dry++;
    else if (a.submitConfirmation === "CAPTCHA") cur.captcha++;
    else if (a.status === "failed") cur.failed++;
    else cur.wait++;
    portals.set(k, cur);
  }
  const portalRows = [...portals.entries()].map(([portal, v]) => ({ portal, ...v, rate: v.t > 0 ? (v.c / v.t) * 100 : 0 })).sort((a, b) => b.t - a.t);

  // Motivo reale del fallimento adapter: il worker lo persiste in canaryLog
  // ({adapterFailure, error}) perché errorMessage viene poi sovrascritto dal
  // messaggio generico "Submit ... non confermato".
  const adapterFail = (c: string | null | undefined): { status: string | null; error: string | null } => {
    if (!c) return { status: null, error: null };
    try {
      const j = JSON.parse(c) as { adapterFailure?: string; error?: string; submitHttpStatus?: number | null; bodyTextAfterSubmit?: string };
      if (j.adapterFailure) return { status: j.adapterFailure, error: j.error ?? null };
      if (j.submitHttpStatus != null || j.bodyTextAfterSubmit) return { status: `canary_http_${j.submitHttpStatus ?? "none"}`, error: (j.bodyTextAfterSubmit ?? "").slice(0, 200) };
    } catch { /* not json */ }
    return { status: null, error: null };
  };

  // Cause non conferma
  const CAUSES: Array<{ label: string; color: string; re: RegExp }> = [
    { label: "Form non trovato (form_not_found)", color: "#fbbf24", re: /^form_not_found$|form.*not.*found|no form|apply button|non trovat/i },
    { label: "Campo mancante (missing_field)", color: "#60a5fa", re: /^missing_field$|required|missing|campo/i },
    { label: "Validazione rifiutata (validation_failed)", color: "#a78bfa", re: /^validation_failed$|invalid|validation|rifiutat/i },
    { label: "Captcha / anti-bot", color: "#94a3b8", re: /^captcha$|captcha|cloudflare|challenge/i },
    { label: "AI / crediti", color: "#f87171", re: /credit balance|crediti|overload|rate limit|anthropic/i },
    { label: "Sconosciuto (unknown_error)", color: "#fb923c", re: /^unknown_error$|timeout|network|fetch failed|\b5\d\d\b/i },
  ];
  const causeCount = new Map<string, number>(CAUSES.map((c) => [c.label, 0]));
  let otherCause = 0;
  for (const a of apps14d) {
    if (isConf(a) || (a.status !== "failed" && !isUnconf(a))) continue;
    const af = adapterFail(a.canaryLog);
    const raw = af.status ? `${af.status} ${af.error ?? ""}` : (a.errorMessage ?? "");
    const hit = CAUSES.find((c) => c.re.test(raw));
    if (hit) causeCount.set(hit.label, (causeCount.get(hit.label) ?? 0) + 1);
    else otherCause++;
  }
  const causeSegments = [
    ...CAUSES.map((c) => ({ label: c.label, value: causeCount.get(c.label) ?? 0, color: c.color })),
    { label: "Altro", value: otherCause, color: "var(--bg-sunken)" },
  ];
  const causeTotal = causeSegments.reduce((s, x) => s + x.value, 0);

  const classify = (msg: string) => {
    const m = msg.toLowerCase();
    if (/credit|crediti|anthropic|overload/.test(m)) return { type: "invalid_request", c: "#f87171" };
    if (/not.?found|form|selector|button/.test(m)) return { type: "not_found_error", c: "#f87171" };
    if (/timeout/.test(m)) return { type: "timeout", c: "#fbbf24" };
    if (/captcha|bot|cloudflare/.test(m)) return { type: "captcha", c: "#fbbf24" };
    if (/\b[45]\d\d\b|http|network/.test(m)) return { type: "http_error", c: "#a78bfa" };
    return { type: "unknown_error", c: "#94a3b8" };
  };

  const rateColor = (r: number) => (r >= 90 ? "hsl(var(--primary))" : r >= 70 ? "#fbbf24" : "#f87171");

  return (
    <div className="adm-page">
      <PageTitle
        title="Consegna"
        sub="Monitora la consegna delle candidature e verifica il corretto invio su tutti i portali."
        actions={
          <>
            <AdminRangeSelect value={DAYS} />
            <span className="adm-pill good"><span className="dot" />Sistema operativo</span>
            <RetryCaptchaButton />
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
        <KpiTrendCard label="Tasso di consegna verificata" value={`${rate.toFixed(1)}%`} sub={`Ultimi ${DAYS} giorni`} delta={rate - pRate} series={sRate} color="hsl(var(--primary))" icon={<Send size={15} />} />
        <KpiTrendCard label="Candidature tentate" value={tentate.toLocaleString("it-IT")} sub="Tutti i portali" delta={dPct(tentate, pTentate)} series={sTentate} color="#60a5fa" icon={<FileCheck size={15} />} />
        <KpiTrendCard label="Confermate" value={confermate.toLocaleString("it-IT")} sub={`ATS ${confAts} · email ${confEmail}`} delta={dPct(confermate, pConf)} series={sConf} color="hsl(var(--primary))" icon={<CheckCircle2 size={15} />} />
        <KpiTrendCard label="Non confermate" value={nonConf.toLocaleString("it-IT")} sub="success senza prova hard" delta={dPct(nonConf, pNon)} series={sNon} color="#f87171" icon={<AlertTriangle size={15} />} />
      </div>

      {/* Funnel + Per portale */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 12, minHeight: 0 }}>
        <div className="adm-card">
          <div className="adm-card-head">
            <div>
              <div className="adm-card-title">Funnel di consegna</div>
              <div className="adm-card-sub">Dal tentativo alla conferma (ultimi {DAYS} giorni)</div>
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
              Tasso di completamento <strong style={{ color: "hsl(var(--primary))", fontSize: 14, marginLeft: 4 }}>{rate.toFixed(1)}%</strong>
            </div>
          </div>
          <div className="adm-card-body">
            <DeliveryFunnel
              steps={[
                { label: "Tentate", value: tentate },
                { label: "Inviate", value: inviate },
                { label: "Rilevate", value: rilevate },
                { label: "Confermate", value: confermate },
              ]}
            />
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head" style={{ alignItems: "center" }}>
            <div className="adm-card-title">Consegne per portale</div>
            <AdminRangeSelect value={DAYS} />
          </div>
          <div className="adm-th" style={{ gridTemplateColumns: "1fr 64px 64px 64px" }}>
            <div>Portale</div><div style={{ textAlign: "right" }}>Tentate</div><div style={{ textAlign: "right" }}>Confermate</div><div style={{ textAlign: "right" }}>Tasso</div>
          </div>
          <div className="adm-card-body scroll">
            {portalRows.length === 0 && <div style={{ padding: "14px 0", fontSize: 12, color: "var(--fg-subtle)" }}>Nessun dato</div>}
            {portalRows.map((p) => (
              <div key={p.portal} className="adm-tr" style={{ gridTemplateColumns: "1fr 64px 64px 64px", padding: "8px 0", rowGap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <PortalBadge portal={p.portal} />
                  <span className="adm-ellipsis" style={{ color: "var(--fg)", textTransform: "capitalize" }}>{p.portal}</span>
                </div>
                <div className="adm-num" style={{ textAlign: "right", color: "var(--fg)" }}>{p.t}</div>
                <div className="adm-num" style={{ textAlign: "right", color: "var(--fg-muted)" }}>{p.c}</div>
                <div className="adm-num" style={{ textAlign: "right", color: rateColor(p.rate), fontWeight: 700 }}>{p.rate.toFixed(1)}%</div>
                <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 6, fontSize: 10.5, color: "var(--fg-muted)" }}>
                  {([["ATS", p.ats, "hsl(var(--primary))"], ["email", p.email, null], ["non conf.", p.unconf, "#fbbf24"], ["dry-run", p.dry, null], ["captcha", p.captcha, null], ["failed", p.failed, "#f87171"], ["in attesa", p.wait, null]] as Array<[string, number, string | null]>).map(([l, n, c]) => (
                    <span key={l} style={{ padding: "1px 7px", borderRadius: 999, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", color: c && n > 0 ? c : "var(--fg-muted)", fontWeight: n > 0 ? 700 : 500 }}>{l} {n}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Andamento + Cause */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 12, minHeight: 0 }}>
        <div className="adm-card">
          <div className="adm-card-head" style={{ alignItems: "center" }}>
            <div className="adm-card-title">Andamento tasso di consegna</div>
            <ChartLegend items={[{ label: "Tentate", color: "#94a3b8" }, { label: "Confermate", color: "hsl(var(--primary))" }, { label: "Non confermate", color: "#f87171" }]} />
          </div>
          <div className="adm-card-body">
            <LineChart fill legend={false} height={200} labels={labels} series={[
              { label: "Tentate", color: "#94a3b8", data: sTentate },
              { label: "Confermate", color: "hsl(var(--primary))", data: sConf },
              { label: "Non confermate", color: "#f87171", data: sNon },
            ]} />
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head"><div className="adm-card-title">Cause non conferma</div></div>
          <div className="adm-card-body" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Donut segments={causeSegments.filter((s) => s.value > 0)} center={{ top: causeTotal.toLocaleString("it-IT"), bottom: "Totali" }} size={128} thickness={18} />
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6, fontSize: 11.5 }}>
              {causeSegments.map((s) => (
                <div key={s.label} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto 34px", gap: 8, alignItems: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                  <span className="adm-ellipsis" style={{ color: "var(--fg-muted)" }}>{s.label}</span>
                  <span className="adm-num" style={{ color: "var(--fg)", fontWeight: 700 }}>{s.value}</span>
                  <span className="adm-num" style={{ color: "var(--fg-subtle)", textAlign: "right" }}>{causeTotal > 0 ? `${Math.round((s.value / causeTotal) * 100)}%` : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Errori + Log */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 12, minHeight: 0 }}>
        <div className="adm-card">
          <div className="adm-card-head" style={{ alignItems: "center", marginBottom: 6 }}>
            <div className="adm-card-title">Errori recenti</div>
          </div>
          <div className="adm-th" style={{ gridTemplateColumns: "12px 52px 90px 120px 1fr" }}>
            <div /><div>Orario</div><div>Portale</div><div>Tipo</div><div>Messaggio</div>
          </div>
          <div className="adm-card-body scroll">
            {failedRecent.length === 0 && <div style={{ padding: "14px 0", fontSize: 12, color: "var(--fg-subtle)" }}>Nessun errore negli ultimi 7 giorni</div>}
            {failedRecent.map((e, i) => {
              const af = adapterFail(e.canaryLog);
              const cls = af.status ? { type: af.status, c: "#f87171" } : classify(e.errorMessage ?? "");
              const msg = af.error ? `${af.error}` : (e.errorMessage ?? "").split(/\n/)[0];
              return (
                <div key={i} className="adm-tr" style={{ gridTemplateColumns: "12px 52px 90px 120px 1fr", padding: "6px 0", fontSize: 12 }} title={`${e.errorMessage ?? ""}\n\n${af.error ?? ""}`}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: cls.c, boxShadow: `0 0 5px ${cls.c}` }} />
                  <span className="adm-num" style={{ color: "var(--fg-muted)" }}>{e.createdAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="adm-ellipsis" style={{ color: "var(--fg)", textTransform: "capitalize" }}>{e.portal || "—"}</span>
                  <span className="adm-ellipsis" style={{ color: "var(--fg-muted)", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{cls.type}</span>
                  <span style={{ color: "var(--fg-muted)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{msg}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateRows: "auto minmax(0,1fr)", gap: 12, minHeight: 0 }}>
        <div className="adm-card" style={{ padding: "10px 14px", minHeight: 0 }}>
          <div className="adm-card-head" style={{ alignItems: "center", marginBottom: 4 }}>
            <div className="adm-card-title" style={{ fontSize: 13 }}>Domande che bloccano</div>
            <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{waitingAuto} in attesa con auto-apply</span>
          </div>
          <div style={{ display: "grid", gap: 3, fontSize: 11.5 }}>
            {blockingQ.length === 0 && <div style={{ color: "var(--fg-subtle)" }}>Nessuna domanda senza risposta</div>}
            {blockingQ.map((q) => (
              <div key={q.label} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 28px", gap: 8 }}>
                <span className="adm-ellipsis" style={{ color: "var(--fg-muted)" }} title={q.label}>{q.label}</span>
                <span className="adm-num" style={{ textAlign: "right", color: "var(--fg)", fontWeight: 700 }}>{q._count._all}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="adm-card" style={{ minHeight: 0 }}>
          <div className="adm-card-head" style={{ alignItems: "center", marginBottom: 6 }}>
            <div className="adm-card-title">Log tecnici (submitConfirmation)</div>
            <div style={{ display: "flex", gap: 6 }}>
              <CopyTargetButton targetId="submit-log" />
            </div>
          </div>
          <div id="submit-log" className="adm-card-body scroll" style={{ background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", borderRadius: 10, padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10.5, lineHeight: 1.7, color: "var(--fg-muted)" }}>
            {apps14d
              .filter((a) => a.submitConfirmation || a.errorMessage)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(0, 50)
              .map((a, i) => {
                const isErr = a.status === "failed";
                const tag = isErr ? "[ERROR]" : isConf(a) ? "[INFO]" : "[WARN]";
                const tc = isErr ? "#f87171" : tag === "[INFO]" ? "hsl(var(--primary))" : "#fbbf24";
                const key = isErr ? "submitConfirmation" : "submitVia";
                const payload = isErr
                  ? { type: classify(a.errorMessage ?? "").type, portal: a.portal, message: (a.errorMessage ?? "").split(/\n/)[0].slice(0, 60) }
                  : { portal: a.portal, status: a.status, submitConfirmation: a.submitConfirmation };
                return (
                  <div key={i} style={{ whiteSpace: "nowrap" }}>
                    <span style={{ color: "var(--fg-subtle)" }}>{a.createdAt.toISOString().slice(0, 19).replace("T", " ")}</span>{" "}
                    <span style={{ color: tc, fontWeight: 700 }}>{tag}</span>{" "}
                    <span style={{ color: "var(--fg)" }}>{key}</span>{" "}
                    <span style={{ color: "#fbbf24" }}>{JSON.stringify(payload)}</span>
                  </div>
                );
              })}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

// Funnel a colonne (4 step) con drop % fra step — fedele al mockup.
function PortalBadge({ portal }: { portal: string }) {
  const letter = (portal[0] ?? "?").toUpperCase();
  const colors = ["#34d399", "#60a5fa", "#a78bfa", "#fbbf24", "#f87171", "#22d3ee", "#f472b6"];
  const h = Array.from(portal).reduce((s, c) => s + c.charCodeAt(0), 0);
  const color = colors[h % colors.length];
  return (
    <div style={{ width: 22, height: 22, borderRadius: 6, background: `color-mix(in srgb, ${color} 20%, transparent)`, color, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{letter}</div>
  );
}
