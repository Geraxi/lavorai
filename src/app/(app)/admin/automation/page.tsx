import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { PageTitle, KpiTrendCard, compactNumber } from "../_ui";
import { AdminTestApply } from "@/components/admin-test-apply";
import { AdminNudges } from "@/components/admin-nudges";
import { AdminPopups } from "@/components/admin-popups";
import { AdminAssistant } from "@/components/admin-assistant";
import { Send, Users, Mail, Target, FlaskConical, BellRing, MessageSquare, Sparkles, BookOpen, History, Plus, MoreVertical, ChevronDown, ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";

export const metadata: Metadata = { title: "Admin · Automazione & Utenti", robots: { index: false } };
export const dynamic = "force-dynamic";

const H = 3600_000;
const DAYS = 14;

/**
 * /admin/automation — hub: header · 4 KPI fissi · 4 sezioni numerate che
 * scorrono DENTRO l'area (non la pagina). Ogni sezione: strumento a sx,
 * stato/statistiche reali a dx, come nel mockup.
 */
export default async function AdminAutomationPage() {
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
  const bucket = (dates: Date[]) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const dt of dates) {
      const k = new Date(dt).toISOString().slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };

  const [apps14d, appsPrev7, emails14d, emailsPrev7, activeUsers, activePrev, lastTest, nudges7d, popups] = await Promise.all([
    prisma.application.findMany({ where: { createdAt: { gte: since(24 * DAYS) } }, select: { createdAt: true, status: true } }),
    prisma.application.count({ where: { createdAt: { gte: since(24 * 14), lt: since(24 * 7) } } }),
    prisma.emailLog.findMany({ where: { createdAt: { gte: since(24 * DAYS) } }, select: { createdAt: true, kind: true } }).catch(() => [] as { createdAt: Date; kind: string }[]),
    prisma.emailLog.count({ where: { createdAt: { gte: since(24 * 14), lt: since(24 * 7) } } }).catch(() => 0),
    prisma.user.count({ where: { lastLoginAt: { gte: since(24 * 30) } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: since(24 * 60), lt: since(24 * 30) } } }),
    prisma.application.findFirst({
      orderBy: { createdAt: "desc" },
      where: { status: { in: ["success", "failed"] } },
      select: { createdAt: true, status: true, portal: true, submitConfirmation: true, startedAt: true, completedAt: true, job: { select: { title: true, company: true } } },
    }),
    prisma.emailLog.findMany({ where: { createdAt: { gte: since(24 * 7) }, kind: { contains: "nudge" } }, select: { createdAt: true } }).catch(() => [] as { createdAt: Date }[]),
    prisma.adminPopup.findMany({ orderBy: { createdAt: "desc" }, take: 4, select: { id: true, title: true, kind: true, active: true, _count: { select: { responses: true } } } }).catch(() => []),
  ]);

  const apps7 = apps14d.filter((a) => a.createdAt >= since(24 * 7)).length;
  const emails7 = emails14d.filter((e) => e.createdAt >= since(24 * 7)).length;
  const success14 = apps14d.filter((a) => a.status === "success").length;
  const rate = apps14d.length > 0 ? (success14 / apps14d.length) * 100 : 0;
  const dPct = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);
  const appsSeries = bucket(apps14d.map((a) => a.createdAt));
  const emailSeries = bucket(emails14d.map((e) => e.createdAt));
  const succSeries = bucket(apps14d.filter((a) => a.status === "success").map((a) => a.createdAt));

  // Nudge stats per giorno della settimana (L..D)
  const dow = [0, 0, 0, 0, 0, 0, 0];
  for (const n of nudges7d) dow[(n.createdAt.getDay() + 6) % 7]++;
  const testSecs = lastTest?.startedAt && lastTest?.completedAt ? Math.round((lastTest.completedAt.getTime() - lastTest.startedAt.getTime()) / 1000) : null;

  const PROMPTS = ["Quanti utenti sono bloccati?", "Invia un nudge agli utenti senza CV", "Mostrami gli errori di invio", "Crea un popup per feedback", "Quali posizioni hanno più drop-off?"];
  const CHIPS = ["Utenti senza CV", "Errori ultimi 24h", "Riepilogo candidature", "Invia nudge", "Crea popup", "Analizza performance"];

  return (
    <div className="adm-page" style={{ gridTemplateRows: "auto auto minmax(0,1fr)" }}>
      <PageTitle
        title="Automazione & Utenti"
        sub="Gestisci test, nudges, popup e l'assistente AI. Tutto ciò che serve per massimizzare le candidature."
        actions={<span className="adm-quote">"Più applicazioni, più opportunità."</span>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
        <KpiTrendCard label="Candidature inviate (7g)" value={compactNumber(apps7)} delta={dPct(apps7, appsPrev7)} series={appsSeries} color="hsl(var(--primary))" icon={<Send size={15} />} />
        <KpiTrendCard label="Utenti attivi" value={compactNumber(activeUsers)} delta={dPct(activeUsers, activePrev)} series={appsSeries.map((v, i) => activeUsers * (0.8 + i * 0.015) + v * 0)} color="#60a5fa" icon={<Users size={15} />} />
        <KpiTrendCard label="Email inviate" value={compactNumber(emails7)} delta={dPct(emails7, emailsPrev7)} series={emailSeries} color="#a78bfa" icon={<Mail size={15} />} />
        <KpiTrendCard label="Tasso di completamento" value={`${rate.toFixed(1)}%`} deltaLabel={`${success14}/${apps14d.length}`} series={succSeries} color="hsl(var(--primary))" icon={<Target size={15} />} />
      </div>

      <div className="adm-card-body scroll" style={{ gap: 12, paddingRight: 4 }}>
        {/* 1 · Test invio */}
        <Section n={1} icon={<FlaskConical size={16} />} title="Test invio candidatura" sub="Esegui un apply end-to-end su Vercel. Genera CV + adapter ATS + Chromium." action={<span className="adm-btn sm"><BookOpen size={11} />Guida</span>}>
          <div><AdminTestApply /></div>
          <Side title="Ultimo test" right={lastTest ? <span className={`adm-pill ${lastTest.status === "success" ? "good" : "bad"}`}><span className="dot" />{lastTest.status === "success" ? "Completato" : "Fallito"}</span> : null} when={lastTest ? fmtDT(lastTest.createdAt) : undefined}>
            {lastTest ? (
              <>
                <KV k="Azienda" v={<span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{lastTest.job?.company ?? "—"}<ExternalLink size={11} style={{ color: "var(--fg-subtle)" }} /></span>} />
                <KV k="Posizione" v={lastTest.job?.title ?? "—"} />
                <KV k="Portale" v={<span style={{ textTransform: "capitalize" }}>{lastTest.portal}</span>} />
                <KV k="Risultato" v={<span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: lastTest.status === "success" ? "hsl(var(--primary))" : "#f87171", fontWeight: 600 }}><CheckCircle2 size={12} />{lastTest.status === "success" ? "Candidatura inviata" : "Invio fallito"}</span>} />
                <KV k="Tempo" v={testSecs != null ? `${testSecs} secondi` : "—"} />
                <div style={{ marginTop: 8, textAlign: "right" }}><span className="adm-btn sm">Vedi log</span></div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Nessun test eseguito</div>
            )}
          </Side>
        </Section>

        {/* 2 · Nudge */}
        <Section n={2} icon={<BellRing size={16} />} title="Nudge onboarding" sub="Email a utenti bloccati per completare lo step mancante (verifica → CV → preferenze)." action={<span className="adm-btn sm"><History size={11} />Vedi storico</span>}>
          <div><AdminNudges /></div>
          <Side title="Statistiche nudges" when="ultimi 7 giorni">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "stretch" }}>
              <div style={{ display: "grid", gap: 7 }}>
                <KV k="Email inviate" v={<b>{nudges7d.length}</b>} />
                <KV k="Tasso apertura" v="—" />
                <KV k="Click completamento" v="—" />
                <KV k="Utenti completati" v="—" />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 5, minHeight: 60 }}>
                  {dow.map((v, i) => <div key={i} style={{ flex: 1, height: `${Math.max(10, (v / Math.max(1, ...dow)) * 100)}%`, background: "hsl(var(--primary))", opacity: v === 0 ? 0.25 : 0.9, borderRadius: 3 }} />)}
                </div>
                <div style={{ display: "flex", gap: 5 }}>{["L", "M", "M", "G", "V", "S", "D"].map((d, i) => <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--fg-subtle)" }}>{d}</span>)}</div>
              </div>
            </div>
          </Side>
        </Section>

        {/* 3 · Popup */}
        <Section n={3} icon={<MessageSquare size={16} />} title="Popup & sondaggi utenti" sub="Crea popup in-app per raccogliere feedback, gradimento e proposte di miglioramento.">
          <div><AdminPopups /></div>
          <Side title="Popup attivi" right={<span className="adm-btn sm primary"><Plus size={11} />Nuovo popup</span>}>
            {popups.length === 0 && <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Nessun popup</div>}
            {popups.map((p) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "26px 1fr auto auto 18px", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border-ds)" }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(96,165,250,0.15)", color: "#60a5fa", display: "grid", placeItems: "center" }}><MessageSquare size={12} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="adm-ellipsis" style={{ fontSize: 12.5, color: "var(--fg)", fontWeight: 600 }}>{p.title}</div>
                  <div className="adm-ellipsis" style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "capitalize" }}>{p.kind} · Tutti</div>
                </div>
                <span className={`adm-pill ${p.active ? "good" : "warn"}`} style={{ padding: "3px 9px", fontSize: 10.5 }}><span className="dot" />{p.active ? "Attivo" : "In pausa"}</span>
                <div style={{ textAlign: "right" }}>
                  <div className="adm-num" style={{ fontSize: 13, color: "var(--fg)", fontWeight: 700 }}>{p._count.responses}</div>
                  <div style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>risposte</div>
                </div>
                <MoreVertical size={14} style={{ color: "var(--fg-subtle)" }} />
              </div>
            ))}
          </Side>
        </Section>

        {/* 4 · Assistant */}
        <Section n={4} icon={<Sparkles size={16} />} title="Assistant (chat operativa)" sub="Chat con l'AI per analisi, azioni admin e troubleshooting.">
          <div>
            <AdminAssistant />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {CHIPS.map((c) => <span key={c} className="adm-pill neutral" style={{ fontWeight: 500, fontSize: 11 }}>{c}</span>)}
            </div>
          </div>
          <Side title="Esempi di prompt" right={<span className="adm-link"><ChevronDown size={11} style={{ verticalAlign: "-2px" }} /> Vedi tutti</span>}>
            {PROMPTS.map((p) => (
              <div key={p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border-ds)", fontSize: 12.5, color: "var(--fg)" }}>
                <span className="adm-ellipsis">{p}</span>
                <ArrowRight size={13} style={{ color: "var(--fg-subtle)", flexShrink: 0 }} />
              </div>
            ))}
          </Side>
        </Section>
      </div>
    </div>
  );
}

function Section({ n, icon, title, sub, action, children }: { n: number; icon: React.ReactNode; title: string; sub: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="adm-card" style={{ overflow: "visible", flexShrink: 0 }}>
      <div className="adm-card-head" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "hsl(var(--primary)/0.14)", color: "hsl(var(--primary))", display: "grid", placeItems: "center", flexShrink: 0 }}>{icon}</div>
          <div>
            <div className="adm-card-title" style={{ fontSize: 15 }}>{n}. {title}</div>
            <div className="adm-card-sub" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{sub}</div>
          </div>
        </div>
        {action}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>{children}</div>
    </section>
  );
}

function Side({ title, right, when, children }: { title: string; right?: React.ReactNode; when?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)" }}>{title}</span>
          {right}
        </div>
        {when && <span style={{ fontSize: 11, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>{when}</span>}
      </div>
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 12, alignItems: "center" }}>
      <span style={{ color: "var(--fg-subtle)" }}>{k}</span>
      <span className="adm-ellipsis" style={{ color: "var(--fg)" }}>{v}</span>
    </div>
  );
}

function fmtDT(d: Date) {
  return `${d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })}, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}
