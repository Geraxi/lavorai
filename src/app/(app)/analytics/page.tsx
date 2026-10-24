import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, Briefcase, ChevronRight, Inbox as InboxIcon, Layers, ListChecks, Route, Send, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { rowToProfile } from "@/lib/cv-profile-types";
import { quickMatchScore } from "@/lib/match-score";
import { getAnalyticsCohort, getRecruiterReplies } from "@/lib/dashboard-metrics-shared";
import { AppTopbar } from "@/components/design/topbar";
import { Card, CardHead } from "@/components/ui-premium/card";
import { StatusBar } from "@/components/ui-premium/status-bar";
import { TrendChart, TrendLegend, type TrendBucket, type TrendSeries } from "@/components/ui-premium/trend-chart";
import { EmptyState } from "@/components/ui-premium/empty-state";
import "./analytics.css";

export const metadata: Metadata = { title: "Analisi" };
export const dynamic = "force-dynamic";

const number = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const percent = (n: number | null) => (n === null ? "—" : `${number(Math.round(n))}%`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function AnalyticsPage({ searchParams }: { searchParams?: Promise<{ days?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const profileRow = await prisma.cVProfile.findUnique({ where: { userId: user.id } });
  const profile = profileRow ? rowToProfile(profileRow) : null;
  const hasMatchProfile = !!profile && (profile.title.trim().length > 1 || profile.skills.some((s) => s.name.trim().length > 1) || profile.experiences.some((e) => e.role.trim().length > 1));
  const [data, allTimeReplies] = await Promise.all([
    getAnalyticsCohort(user.id, Number(params?.days), hasMatchProfile ? (title, description) => quickMatchScore(profile!, `${title}\n${description}`) : undefined),
    getRecruiterReplies(user.id),
  ]);
  const complete = profile
    ? Math.round([profile.firstName && profile.lastName, profile.email, profile.phone, profile.city, profile.title, profile.summary, profile.experiences.some((e) => e.role && e.company), profile.education.some((e) => e.degree && e.school), profile.skills.length, profile.languages.length].filter(Boolean).length / 10 * 100)
    : 0;

  // Daily for 7 days; otherwise rolling 7-day windows counted back from today
  // (like the dashboard). A short leftover at the start is merged into the
  // oldest window when it has fewer than 4 days, so there is no fake dip.
  const size = data.days === 7 ? 1 : 7;
  const windows: { bucket: TrendBucket; sent: number; replies: number }[] = [];
  for (let end = data.buckets.length; end > 0; end -= size) {
    let startIdx = Math.max(0, end - size);
    if (size > 1 && startIdx > 0 && startIdx < 4) startIdx = 0;
    const slice = data.buckets.slice(startIdx, end);
    windows.unshift({
      bucket: { start: iso(slice[0].date), end: iso(slice[slice.length - 1].date) },
      sent: slice.reduce((s, d) => s + d.sent, 0),
      replies: slice.reduce((s, d) => s + d.replies, 0),
    });
    end = startIdx + size;
  }
  const series: TrendSeries[] = [
    { key: "sent", label: "Invii confermati", tone: "green", values: windows.map((w) => w.sent) },
    { key: "replies", label: "Prime risposte", tone: "neutral", values: windows.map((w) => w.replies) },
  ];
  const outside = data.providerAccepted + data.pending + data.legacyUnverified + data.deliveryProblems;
  const recorded = data.sent + outside;

  const needsFocus = data.match !== null && data.match < 60;
  const hasUnverified = !data.sent && outside > 0;
  const next = hasUnverified
    ? { title: "Controlla gli esiti degli invii", text: "Ci sono invii registrati senza una prova di consegna verificata. Controlla lo stato nelle candidature prima di riprovare.", href: "/applications?stage=unverified", label: "Controlla gli invii" }
    : !data.sent
      ? { title: "Trova la tua prossima opportunità", text: "In questo periodo non ci sono invii confermati. Esplora le offerte compatibili con il tuo profilo.", href: "/jobs", label: "Esplora le offerte" }
      : needsFocus
        ? { title: "Concentrati sui ruoli più in linea", text: `Il match stimato medio degli invii del periodo è ${percent(data.match)}. Rivedi ruoli target e criteri di ricerca.`, href: "/preferences", label: "Migliora i criteri" }
        : complete < 100
          ? { title: "Completa il tuo profilo", text: "Aggiungi le informazioni mancanti nel CV per rendere più precise le prossime candidature.", href: "/cv", label: "Completa il profilo" }
          : { title: "Segui le conversazioni aperte", text: "Controlla le risposte nell’Inbox e prepara il prossimo passo con le aziende interessate.", href: "/inbox", label: "Apri Inbox" };

  const periodLabel = `ultimi ${data.days} giorni`;

  return (
    <>
      <AppTopbar title="Analisi" breadcrumb="Lavoro" />
      <div className="pm-page analytics">
        <header className="pm-page-head">
          <div>
            <h1>Analisi</h1>
            <p className="pm-muted">Cosa succede agli invii confermati negli {periodLabel}: risposte, colloqui e qualità della ricerca.</p>
          </div>
          <nav className="pm-page-actions" aria-label="Periodo di analisi">
            <div className="pm-seg">
              {[7, 30, 90].map((d) => (
                <Link key={d} href={`/analytics?days=${d}`} aria-current={d === data.days ? "page" : undefined}>{d} giorni</Link>
              ))}
            </div>
          </nav>
        </header>

        {/* Funnel of the period cohort */}
        <Card className="an-funnel" labelledBy="an-funnel-title">
          <CardHead id="an-funnel-title" icon={Route} title={`Dall’invio al colloquio · ${periodLabel}`} />
          <ol className="an-steps">
            <li>
              <span className="an-step-label"><Send size={13} strokeWidth={1.75} aria-hidden /> Invii confermati</span>
              <strong className="an-step-value" data-metric="cohort-sent">{number(data.sent)}</strong>
              <span className="an-step-hint">{data.portalConfirmed} ricevute ATS · {data.emailDelivered} email consegnate</span>
            </li>
            <li aria-hidden className="an-step-arrow"><ChevronRight size={16} /></li>
            <li>
              <span className="an-step-label"><InboxIcon size={13} strokeWidth={1.75} aria-hidden /> Con risposta</span>
              <strong className="an-step-value" data-metric="cohort-replied">{number(data.replied)}</strong>
              <span className="an-step-hint">{data.sent ? `${percent(data.responseRate)} degli invii confermati` : "nessun invio confermato"}</span>
            </li>
            <li aria-hidden className="an-step-arrow"><ChevronRight size={16} /></li>
            <li>
              <span className="an-step-label"><ListChecks size={13} strokeWidth={1.75} aria-hidden /> Colloqui</span>
              <strong className="an-step-value" data-metric="cohort-interviews">{number(data.interviews)}</strong>
              <span className="an-step-hint">{data.sent ? `${percent(data.interviews / data.sent * 100)} degli invii confermati` : "nessun invio confermato"}</span>
            </li>
          </ol>
          <p className="pm-foot">
            Coorte: candidature con prova di consegna nel periodo; risposte umane classificate da LavorAI ricevute dopo l’invio, una per candidatura.
            Nello storico completo le candidature con risposta sono <b data-metric="alltime-replies">{allTimeReplies}</b>, come in Dashboard.
          </p>
        </Card>

        <Card className="an-trend" labelledBy="an-trend-title">
          <CardHead id="an-trend-title" icon={Activity} title="Invii e prime risposte" actions={data.sent > 0 ? <TrendLegend series={series} /> : undefined} />
          <div className="pm-pad">
            {data.sent === 0 ? (
              <EmptyState icon={Send} title="Nessun invio confermato nel periodo" text="Il grafico mostra solo invii con prova di consegna. Prova un periodo più lungo." />
            ) : (
              <TrendChart buckets={windows.map((w) => w.bucket)} series={series} locale="it" ariaLabel={`Invii confermati e prime risposte, ${periodLabel}`} />
            )}
          </div>
          <p className="pm-foot">{size === 1 ? "Un punto per giorno" : "Un punto per settimana (finestre di 7 giorni fino a oggi)"}, ora di Roma. Le risposte sono contate nel giorno in cui arrivano.</p>
        </Card>

        <div className="an-grid">
          <Card labelledBy="an-outcome-title">
            <CardHead id="an-outcome-title" icon={Layers} title="Esito degli invii registrati" actions={<span className="pm-count">{recorded}</span>} />
            <div className="pm-pad">
              {recorded === 0 ? (
                <p className="pm-muted an-small">Nessun invio registrato nel periodo.</p>
              ) : (
                <StatusBar showShare={false} segments={[
                  { key: "sent", label: "Consegna confermata", count: data.sent, tone: "green" },
                  { key: "accepted", label: "Accettate dal provider", count: data.providerAccepted, tone: "neutral" },
                  { key: "sent_unverified", label: "Invii registrati, senza conferma", count: data.legacyUnverified, tone: "amber" },
                  { key: "unverified", label: "Esito da verificare", count: data.pending, tone: "amber" },
                  { key: "problem", label: "Problemi di consegna", count: data.deliveryProblems, tone: "red" },
                ]} />
              )}
            </div>
            <p className="pm-foot">Solo la consegna confermata entra nei conteggi dell’analisi. Una conferma HTTP generica non basta; la consegna email non prova lettura.</p>
          </Card>

          <Card labelledBy="an-quality-title">
            <CardHead id="an-quality-title" icon={Sparkles} title="Qualità della ricerca" />
            <ul className="an-meters">
              <Meter label="Match medio stimato" value={data.match} tone={needsFocus ? "amber" : "green"} hint="sul CV attuale, non una previsione" />
              <Meter label="CV personalizzati" value={data.tailored} hint="invii con un CV generato" />
              <Meter label="Profilo completo" value={complete} hint="10 sezioni del profilo" />
            </ul>
          </Card>
        </div>

        <Card labelledBy="an-roles-title">
          <CardHead id="an-roles-title" icon={Briefcase} title="Risultati per ruolo" actions={<span className="pm-count">{data.roles.length}</span>} />
          {data.roles.length === 0 ? (
            <div className="pm-pad"><p className="pm-muted an-small">Nessun invio confermato in questo periodo.</p></div>
          ) : (
            <div className="an-table-scroll">
              <table className="an-table">
                <thead>
                  <tr>
                    <th scope="col">Ruolo</th>
                    <th scope="col" className="is-num">Invii</th>
                    <th scope="col" className="is-num">Match<span className="an-hide-sm"> medio</span></th>
                    <th scope="col" className="is-num an-hide-sm">Risposte</th>
                    <th scope="col" className="is-num">Tasso<span className="an-hide-sm"> risposta</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.roles].sort((x, y) => y.sent - x.sent).slice(0, 8).map((r) => (
                    <tr key={r.role}>
                      <th scope="row">{r.role}</th>
                      <td className="is-num">{r.sent}</td>
                      <td className="is-num">
                        <span className="an-inline-meter">
                          <span className="an-track" aria-hidden><span style={{ width: `${r.match ?? 0}%` }} /></span>
                          {percent(r.match)}
                        </span>
                      </td>
                      <td className="is-num an-hide-sm">{r.replies}</td>
                      <td className="is-num">{r.sent ? percent(r.replies / r.sent * 100) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.roles.length > 8 && <p className="pm-foot">Mostrate le 8 ricerche con più invii.</p>}
          {data.roles.length > 0 && <>
          <div className="an-tiles" aria-label="Risposte per livello di match">
            {data.segments.map((s, i) => (
              <div key={i} className="an-tile">
                <span className="an-tile-label">{i === 0 ? "Match ≥ 70%" : "Match < 70%"}</span>
                <strong className="an-tile-value">{s.count ? percent(s.rate) : "—"}</strong>
                <span className="an-tile-hint">{s.count ? `${s.responses} risposte su ${s.count} invii` : "nessun invio"}</span>
              </div>
            ))}
          </div>
          <p className="pm-foot an-caveat">Con meno di 10 invii per gruppo il confronto non è affidabile. Non dimostra un rapporto di causa ed effetto.</p>
          </>}
        </Card>

        <section className="pm-card pm-card-featured an-next" aria-labelledby="an-next-title">
          <div>
            <span className="pm-eyebrow">La prossima mossa</span>
            <h2 id="an-next-title">{next.title}</h2>
            <p className="pm-muted">{next.text}</p>
          </div>
          <div className="an-next-actions">
            <Link className="pm-btn-primary" href={next.href}>{next.label}<ArrowRight size={14} aria-hidden /></Link>
            <Link className="pm-btn-ghost" href="/applications">Vedi le candidature</Link>
          </div>
        </section>
      </div>
    </>
  );
}

function Meter({ label, value, hint, tone = "green" }: { label: string; value: number | null; hint: string; tone?: "green" | "amber" }) {
  return (
    <li className="an-meter">
      <div className="an-meter-top"><span>{label}</span><b>{percent(value)}</b></div>
      <span className={`an-track tone-${tone}`} aria-hidden><span style={{ width: `${value ?? 0}%` }} /></span>
      <span className="an-meter-hint">{hint}</span>
    </li>
  );
}
