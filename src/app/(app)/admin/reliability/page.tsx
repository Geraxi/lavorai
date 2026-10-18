import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { loadReliabilityMetrics } from "@/lib/reliability-metrics";
import { Kpi, PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Affidabilità", robots: { index: false } };
export const dynamic = "force-dynamic";

const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);
const hours = (value: number | null) => (value === null ? "—" : value < 48 ? `${value.toFixed(1)} h` : `${(value / 24).toFixed(1)} g`);
const LABELS: Record<string, string> = {
  draft: "Bozza", approved: "Approvata / in coda", submitting: "Invio in corso", confirmed_submitted: "Inviata, confermata",
  submitted_unverified: "Inviata, non verificata", failed: "Non inviata", needs_manual: "Da inviare a mano",
};

/** /admin/reliability: delivery truth + activation/retention/monetization, test accounts excluded. */
export default async function AdminReliabilityPage({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  // Page-level gate (not only the layout): metrics never render for non-admins.
  const viewer = await getCurrentUser();
  if (!isAdmin(viewer?.email)) notFound();
  const sp = (await searchParams) ?? {};
  const days = [7, 14, 30, 90].includes(Number(sp.range)) ? Number(sp.range) : 30;
  const m = await loadReliabilityMetrics(viewer?.email, days);
  const d = m.delivery;
  return (
    <div className="adm-page" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PageTitle title="Affidabilità" sub={`Ultimi ${days} giorni · account interni/test esclusi · stati derivati dalle prove di invio`}
        actions={<div style={{ display: "flex", gap: 6 }}>{[7, 14, 30, 90].map((r) => <a key={r} href={`?range=${r}`} className="adm-chip" style={{ fontWeight: r === days ? 700 : 400 }}>{r}g</a>)}</div>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
        <Kpi label="Consegna confermata" value={pct(d.confirmedRate)} sub={`${d.byStatus.confirmed_submitted} di ${d.outcomes} esiti (ricevuta ATS o email consegnata)`} tone="good" />
        <Kpi label="Inviata, non verificata" value={pct(d.unverifiedRate)} sub={`${d.byStatus.submitted_unverified} senza prova di ricezione`} tone="warn" />
        <Kpi label="Non inviata" value={pct(d.failedRate)} sub={`${d.byStatus.failed} fallite · ${d.byStatus.needs_manual} da inviare a mano`} tone="bad" />
        <Kpi label="Attivazione" value={pct(m.activation.rate)} sub={`${m.activation.activated} di ${m.cohort.signups} iscritti: CV + preferenze + 1ª candidatura preparata`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
        <Kpi label="Tempo alla 1ª candidatura utile" value={hours(m.timeToFirstUseful.medianHours)} sub={`mediana, ${m.timeToFirstUseful.users} utenti con invio confermato · 1ª preparata: ${hours(m.timeToFirstUseful.medianHoursToFirstPrepared)}`} />
        <Kpi label="Ritorno D7 / D30" value={`${pct(m.retention.d7.rate)} / ${pct(m.retention.d30.rate)}`} sub={`attività autenticata dopo il giorno 7 (${m.retention.d7.eligible} idonei) / 30 (${m.retention.d30.eligible})`} />
        <Kpi label="Conversione a pagamento" value={pct(m.monetization.paidConversionRate)} sub={`${m.monetization.cohortPaid} della coorte · ${m.monetization.payingNow} paganti ora · ${m.monetization.cancellations} cancellazioni (+${m.monetization.pendingCancellation} a fine periodo)`} />
        <Kpi label="Costo AI per candidatura completata" value={m.aiCost.estimatedUsdPerCompleted === null ? "—" : `$${m.aiCost.estimatedUsdPerCompleted.toFixed(3)} (stima)`}
          sub={!m.aiCost.available ? "Tabella AiUsageEvent non ancora creata: nessun dato" : m.aiCost.calls === 0 ? "Nessuna chiamata registrata nel periodo"
            : `${m.aiCost.tokensPerCompleted === null ? "—" : Math.round(m.aiCost.tokensPerCompleted).toLocaleString("it-IT")} token/completata · ${m.aiCost.pricedFully ? "prezzi da AI_PRICING_USD_PER_MTOK" : "prezzi modello non configurati: solo token"}`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
        <section className="adm-card"><div className="adm-card-head"><div><div className="adm-card-title">Stato candidature create</div><div className="adm-card-sub">{d.created} nel periodo, stati espliciti derivati</div></div></div>
          {Object.entries(d.byStatus).map(([k, v]) => <Row key={k} label={LABELS[k] ?? k} value={v} />)}</section>
        <section className="adm-card"><div className="adm-card-head"><div><div className="adm-card-title">Per canale</div><div className="adm-card-sub">confermate · non verificate · fallite</div></div></div>
          {d.byChannel.length ? d.byChannel.map(([channel, c]) => <Row key={channel} label={channel} value={`${c.confirmed} · ${c.unverified} · ${c.failed}`} />) : <Row label="Nessun esito" value="" />}</section>
        <section className="adm-card"><div className="adm-card-head"><div><div className="adm-card-title">Motivi</div><div className="adm-card-sub">fallimenti tipizzati e invii manuali</div></div></div>
          {[...d.failureReasons.map(([k, v]) => [`✕ ${k}`, v] as const), ...d.manualReasons.map(([k, v]) => [`✋ ${k}`, v] as const)].map(([k, v]) => <Row key={k} label={k} value={v} />)}</section>
      </div>
      <section className="adm-card"><div className="adm-card-head"><div><div className="adm-card-title">Esiti (solo con prova)</div>
        <div className="adm-card-sub">Risposte umane e colloqui classificati dall&apos;inbox (email inoltrate o Gmail collegata). Mai dedotti.</div></div></div>
        <Row label="Candidature inviate nel periodo" value={m.outcomes.sent} /><Row label="Con risposta umana" value={`${m.outcomes.replied} (${pct(m.outcomes.replyRate)})`} /><Row label="Colloqui" value={m.outcomes.interviews} />
      </section>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string | number }) {
  return <div className="adm-tr" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><span className="adm-ellipsis">{label}</span><b className="adm-num" style={{ textAlign: "right" }}>{value}</b></div>;
}
