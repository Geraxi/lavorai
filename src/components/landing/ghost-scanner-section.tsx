import { EyeOff, Link2Off, CalendarClock, Repeat, EuroIcon, MapPinOff, MessageSquareWarning } from "lucide-react";
import { GhostBadge } from "@/components/ghost-badge";
import { scoreGhostJob, ghostSummary, GHOST_LEVEL_LABEL, type GhostJobInput, type GhostJobSibling } from "@/lib/ghost-job";
import { Reveal } from "./landing-reveal";
import styles from "./ghost-scanner-section.module.css";

type L = (it: string, en: string) => string;

// Anteprima illustrativa: aziende e annunci fittizi, valutati con lo STESSO
// scorer usato nel prodotto (src/lib/ghost-job.ts) su una data fissa.
const NOW = new Date("2026-10-20T10:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const FULL = "Entrerai nel team prodotto per progettare i flussi di pagamento: ricerca utenti, prototipi in Figma, design system condiviso con gli sviluppatori. Requisiti: 3 anni di esperienza in prodotti digitali, portfolio con casi reali. Offriamo contratto a tempo indeterminato, RAL indicata, 2 giorni di smart working a settimana.";
const DEMO: { job: GhostJobInput; siblings?: GhostJobSibling[] }[] = [
  { job: { id: "d1", title: "Product Designer", company: "Studio North", location: "Milano", description: FULL, remote: false, salaryMin: 38000, salaryMax: 46000, postedAt: ago(4), source: "greenhouse" } },
  {
    job: { id: "d2", title: "UX Designer", company: "Orbit Labs", location: "Torino", description: "Cerchiamo UX Designer con esperienza in Figma per il nostro team.", remote: false, salaryMin: 32000, salaryMax: 36000, postedAt: ago(41), source: "greenhouse" },
    siblings: [{ id: "d2b", title: "UX Designer", company: "Orbit Labs", location: "Torino", postedAt: ago(75) }],
  },
  { job: { id: "d3", title: "Designer - Talent Pool", company: "Forma Studio", location: null, description: "Siamo sempre alla ricerca di talenti per il nostro talent pool! Ambiente giovane e dinamico, forte motivazione e voglia di crescere.", remote: false, salaryMin: null, salaryMax: null, postedAt: ago(68), closedAt: ago(2), source: "greenhouse" } },
];

export function GhostScannerSection({ l }: { l: L }) {
  const rows = DEMO.map(({ job, siblings }) => ({ job, r: scoreGhostJob(job, siblings ?? [], NOW) }));
  const focus = rows[2].r;
  const signals = [
    { icon: Link2Off, it: "Link di candidatura non più attivo", en: "Apply link no longer active" },
    { icon: CalendarClock, it: "Annuncio pubblicato da molto tempo", en: "Listing posted a long time ago" },
    { icon: Repeat, it: "Stesso ruolo ripubblicato più volte", en: "Same role reposted several times" },
    { icon: EuroIcon, it: "Retribuzione non indicata", en: "Salary not stated" },
    { icon: MapPinOff, it: "Sede di lavoro non indicata", en: "Work location not stated" },
    { icon: MessageSquareWarning, it: "Testo vago, da “siamo sempre alla ricerca”", en: "Vague “we’re always hiring” wording" },
  ];
  return (
    <section id="annunci-fantasma" className={styles.section} aria-labelledby="ghost-title">
      <div className={styles.container}>
        <Reveal className={styles.heading}>
          <p className={styles.kicker}>{l("Scanner annunci fantasma", "Ghost-job scanner")}</p>
          <h2 id="ghost-title">{l("Non sprecare candidature", "Don’t waste applications")}<br /><span>{l("su annunci fantasma.", "on ghost jobs.")}</span></h2>
          <p className={styles.lead}>{l(
            "Alcuni annunci restano online anche quando nessuno sta davvero assumendo. LavorAI assegna a ogni offerta un rischio basso, medio o alto e ti mostra sempre il perché. Gli annunci sospetti puoi nasconderli con un clic.",
            "Some listings stay online even when nobody is really hiring. LavorAI gives every offer a low, medium or high risk level and always shows you why. Suspicious listings can be hidden in one click.",
          )}</p>
        </Reveal>

        <div className={styles.grid}>
          <div className={styles.mock} data-ui="" aria-label={l("Anteprima illustrativa dell’elenco offerte", "Illustrative preview of the job list")}>
            <div className={styles.mockHead}>
              <span>{l("Offerte di lavoro", "Job offers")}</span>
              <span className={styles.mockFilter}><span className={styles.check} aria-hidden="true" /><EyeOff size={13} strokeWidth={1.75} aria-hidden="true" />{l("Nascondi sospetti", "Hide suspicious")}</span>
            </div>
            <ul className={styles.mockList}>
              {rows.map(({ job, r }) => (
                <li key={job.id} className={styles.mockRow}>
                  <span className={styles.logo} aria-hidden="true">{job.company?.[0]}</span>
                  <span className={styles.rowText}><strong>{job.title}</strong><small>{[job.company, job.location].filter(Boolean).join(" · ")}</small></span>
                  <span className={styles.rowBadge}><GhostBadge result={r} showLow /></span>
                </li>
              ))}
            </ul>
            <div className={styles.tooltip} role="note" aria-label={ghostSummary(focus)}>
              <div className={styles.tooltipHead}><GhostBadge result={focus} showLow /><span>{GHOST_LEVEL_LABEL[focus.level]}</span></div>
              <ul>{focus.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <p className={styles.note}>{l("Anteprima illustrativa · aziende e annunci di esempio.", "Illustrative preview · sample companies and listings.")}</p>
          </div>

          <div className={styles.copy}>
            <h3>{l("Cosa controlliamo", "What we check")}</h3>
            <ul className={styles.signals}>
              {signals.map(({ icon: Icon, it, en }) => <li key={it}><Icon size={18} strokeWidth={1.5} aria-hidden="true" /><span>{l(it, en)}</span></li>)}
            </ul>
            <p className={styles.small}>{l(
              "Nessun punteggio inventato: se mancano i dati per valutare un annuncio te lo diciamo (“dati insufficienti”). Il rischio è un’indicazione, non una certezza: la scelta resta tua.",
              "No made-up scores: if there isn’t enough data to judge a listing, we tell you (“insufficient data”). The risk is a hint, not a certainty: the choice stays yours.",
            )}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
