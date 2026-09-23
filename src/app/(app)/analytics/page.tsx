import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { Icon } from "@/components/design/icon";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { aggregatePerformance, analyticsPeriod } from "@/lib/analytics-performance";
import "./performance.css";

export const metadata: Metadata = { title: "Analisi" };
export const dynamic = "force-dynamic";
const number = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const percent = (n: number | null) => n === null ? "—" : `${number(n)}%`;
const shortDate = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function AnalyticsPage({ searchParams }: { searchParams?: Promise<{ days?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const now = new Date();
  const period = analyticsPeriod(Number(params?.days), now);
  const [applications, profileRow] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id, status: "success", submittedVia: { not: null }, OR: [
        { submittedAt: { gte: period.start, lte: now } },
        { submittedAt: null, completedAt: { gte: period.start, lte: now } },
        { submittedAt: null, completedAt: null, createdAt: { gte: period.start, lte: now } },
      ] },
      select: { status: true, submittedVia: true, submitConfirmation: true, createdAt: true, completedAt: true, submittedAt: true,
        userStatus: true, lastReplyAt: true, lastReplyKind: true, cvDocxPath: true, cvPdfPath: true,
        replies: { select: { receivedAt: true, kind: true, isHuman: true } },
        gmailMessages: { select: { date: true, kind: true, isHuman: true } },
        job: { select: { title: true, description: true } }, session: { select: { title: true } },
      },
    }),
    prisma.cVProfile.findUnique({ where: { userId: user.id } }),
  ]);
  const profile = profileRow ? rowToProfile(profileRow) : null;
  const hasMatchProfile = profile && (profile.title.trim().length > 1 || profile.skills.some(s => s.name.trim().length > 1) || profile.experiences.some(e => e.role.trim().length > 1));
  const data = aggregatePerformance(applications.map(a => ({ ...a, role: a.session?.title?.trim() || a.job.title,
    match: hasMatchProfile && a.job.description.trim() ? quickMatchScore(profile!, `${a.job.title}\n${a.job.description}`) : null,
  })), period.days, now);
  const complete = profile ? Math.round([profile.firstName && profile.lastName, profile.email, profile.phone, profile.city, profile.title, profile.summary, profile.experiences.some(e => e.role && e.company), profile.education.some(e => e.degree && e.school), profile.skills.length, profile.languages.length].filter(Boolean).length / 10 * 100) : 0;
  const peak = Math.max(1, ...data.buckets.flatMap(d => [d.sent, d.replies]));
  const step = Math.max(1, Math.ceil(peak / 3));
  const max = step * 3;
  const needsFocus = data.match !== null && data.match < 60;
  const state = !data.sent ? "Pronta a partire" : needsFocus ? "Da ottimizzare" : !data.replied ? "In attesa di risposte" : "Risposte in arrivo";
  const action = !data.sent ? "Trova la tua prossima opportunità" : needsFocus ? "Concentrati sui ruoli più in linea" : complete < 100 ? "Completa il tuo profilo" : "Continua a seguire le tue candidature";
  const actionText = !data.sent ? "Esplora le offerte compatibili con il tuo profilo e invia la prima candidatura." : needsFocus ? "Rivedi i ruoli target e i criteri di ricerca: alcune candidature hanno un match stimato inferiore al 60%." : complete < 100 ? "Aggiungi le informazioni mancanti nel CV per rendere più precise le prossime candidature." : "Controlla le risposte nell’Inbox e prepara il prossimo passo con le aziende interessate.";
  const actionHref = !data.sent ? "/jobs" : needsFocus ? "/preferences" : complete < 100 ? "/cv" : "/inbox";
  const actionLabel = !data.sent ? "Esplora le offerte" : needsFocus ? "Migliora i criteri" : complete < 100 ? "Completa il profilo" : "Apri Inbox";
  return <div className="performance-page">
    <header className="performance-header">
      <div><h1>Le tue performance</h1><p>Dalle candidature ai colloqui: cosa sta funzionando e cosa migliorare.</p></div>
      <div className="performance-header-tools"><span className="performance-date"><Icon name="calendar" size={18} />{now.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</span>
        <nav className="performance-period" aria-label="Periodo di analisi">{[7, 30, 90].map(days => <Link key={days} href={`/analytics?days=${days}`} aria-current={days === period.days ? "page" : undefined}>{days} giorni</Link>)}</nav>
      </div>
    </header>
    <section className="performance-kpis" aria-label="Risultati nel periodo">
      <Kpi value={number(data.sent)} label="candidature inviate" detail="Nel periodo selezionato" />
      <Kpi value={number(data.replied)} label={data.replied === 1 ? "candidatura con risposta" : "candidature con risposta"} color="blue" detail={<>Tasso di risposta <b className="performance-blue">{percent(data.responseRate)}</b><br />Escluse aperture e ricevute automatiche</>} />
      <Kpi value={number(data.interviews)} label="candidature con colloquio" color="violet" detail={`${percent(data.sent ? data.interviews / data.sent * 100 : 0)} sulle candidature inviate`} />
      <Kpi value={`${number(data.savedHours)}h`} label="risparmiate · stima" detail="Stima 15 min per candidatura" />
    </section>
    <section className="performance-middle">
      <div className="performance-chart-section">
        <div className="performance-section-heading"><h2>Candidature e risposte</h2><div className="performance-legend"><span><i />Candidature inviate</span><span><i className="blue" />Prime risposte ricevute</span></div></div>
        <div className="performance-chart" role="img" aria-label={`${data.sent} candidature inviate e ${data.replied} candidature con risposta negli ultimi ${period.days} giorni. Dettaglio giornaliero nella tabella seguente.`}>
          <div className="performance-yaxis">{[3, 2, 1, 0].map(i => <span key={i}>{i * step}</span>)}</div>
          <div className="performance-plot"><div className="performance-gridlines">{[0, 1, 2, 3].map(i => <span key={i} />)}</div>
            <div className="performance-bars">{data.buckets.map(d => <div className="performance-day" key={d.date.toISOString()} title={`${shortDate(d.date)}: ${d.sent} inviate, ${d.replies} prime risposte`}><span style={{ height: `${d.sent / max * 100}%` }} /><span className="blue" style={{ height: `${d.replies / max * 100}%` }} /></div>)}</div>
            {!data.sent && <div className="performance-chart-empty">Le tue performance iniziano con la prima candidatura.</div>}
          </div>
          <div className="performance-xaxis">{Array.from({ length: 5 }, (_, i) => data.buckets[Math.round(i * (period.days - 1) / 4)].date).map(d => <span key={d.toISOString()}>{shortDate(d)}</span>)}</div>
        </div>
        <p className="performance-chart-note"><Info size={16} /> Risposte alle candidature inviate nel periodo. Ogni candidatura conta una sola volta.</p>
        <details className="performance-daily"><summary>Vedi i dati giornalieri</summary><div className="performance-table-scroll"><table><caption>Giorni in UTC · {period.days} giorni</caption><thead><tr><th>Data</th><th>Inviate</th><th>Prime risposte</th></tr></thead><tbody>{data.buckets.map(d => <tr key={d.date.toISOString()}><th>{shortDate(d.date)}</th><td>{d.sent}</td><td>{d.replies}</td></tr>)}</tbody></table></div></details>
      </div>
      <aside className="performance-health"><h2>Stato della ricerca</h2><h3 className={needsFocus ? "performance-amber" : "performance-green"}><i />{state}</h3><p>{!data.sent ? "Qui vedrai i risultati dopo i primi invii." : needsFocus ? "Il match stimato suggerisce di affinare la ricerca. Parti dai ruoli più vicini al tuo profilo." : !data.replied ? "Gli invii sono registrati. Le risposte compariranno quando saranno rilevate nell’Inbox collegata." : "Hai ricevuto risposte. Segui le conversazioni e individua i ruoli che funzionano meglio."}</p>
        <div className="performance-health-meters"><Meter label="Match medio stimato" value={data.match} amber={needsFocus} /><Meter label="CV personalizzati" value={data.tailored} /><Meter label="Profilo completo" value={complete} /></div>
        <p className="performance-fine">Match calcolato sul CV attuale, non una previsione di assunzione. Profilo: 10 sezioni di dati; CV personalizzati: documenti generati disponibili.</p>
      </aside>
    </section>
    <section className="performance-next"><div><h2>La prossima mossa</h2><h3>{action}</h3><p>{actionText}</p></div><div className="performance-actions"><Link className="performance-button primary" href={actionHref}>{actionLabel}<Icon name="arrow-right" size={16} /></Link><Link className="performance-button" href="/applications">Vedi le candidature</Link></div></section>
    <section className="performance-bottom">
      <div className="performance-panel"><h2>Risultati per ruolo</h2><p>Invii e risposte nel periodo selezionato.</p><div className="performance-table-scroll"><table><thead><tr><th>Ruolo / ricerca</th><th>Inviate</th><th>Match stimato</th><th>Con risposta</th></tr></thead><tbody>{data.roles.slice(0, 8).map(r => <tr key={r.role}><th>{r.role}</th><td>{r.sent}</td><td><span className="performance-table-match">{percent(r.match)}<span className="performance-track"><span style={{ width: `${r.match ?? 0}%` }} /></span></span></td><td>{r.replies} <span className="performance-muted">({percent(r.replies / r.sent * 100)})</span></td></tr>)}</tbody></table>{!data.roles.length && <div className="performance-empty">Nessuna candidatura inviata in questo periodo.</div>}</div>{data.roles.length > 8 && <p className="performance-fine">Mostrate le 8 ricerche con più invii.</p>}</div>
      <aside className="performance-panel performance-insight"><h2>Un insight utile</h2><p>{data.segments.every(s => s.count >= 10) ? "Confronta le risposte ricevute per livello di match stimato." : "Servono almeno 10 invii per gruppo per iniziare un confronto utile. I dati disponibili sono qui sotto."}</p>
        {data.segments.map((s, i) => <div key={i} className="performance-segment"><div><span>Match {i === 0 ? ">" : "≤"} 70%</span><strong>{percent(s.rate)}</strong></div><span className={`performance-track ${i ? "muted" : ""}`}><span style={{ width: `${s.rate ?? 0}%` }} /></span><small>{s.responses} risposte su {s.count} invii</small></div>)}
        <p className="performance-fine">Basato sulle risposte umane rilevate da LavorAI. I dati possono essere incompleti se la posta non è collegata. Il confronto non dimostra un rapporto di causa ed effetto.</p>
      </aside>
    </section>
  </div>;
}
function Kpi({ value, label, detail, color = "green" }: { value: string; label: string; detail: React.ReactNode; color?: string }) {
  return <div className="performance-kpi"><strong>{value}</strong><div><i className={color} />{label}</div><p>{detail}</p></div>;
}
function Meter({ label, value, amber = false }: { label: string; value: number | null; amber?: boolean }) {
  return <div className="performance-meter"><span>{label}</span><span className={`performance-track ${amber ? "amber" : ""}`}><span style={{ width: `${value ?? 0}%` }} /></span><strong>{percent(value)}</strong></div>;
}
