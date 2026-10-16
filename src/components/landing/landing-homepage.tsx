"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import localFont from "next/font/local";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import {
  ArrowDownToLine, ArrowRight, BriefcaseBusiness,
  Check, FileText, Fingerprint, Layers, ListChecks,
  MapPin, MessageSquare, Pause, PenLine, Plus, ShieldCheck, Trash2, Users, X, Zap,
} from "lucide-react";
import { CinematicHero } from "./cinematic-hero";
import { SectionLeadMagnet } from "@/components/sections/lead-magnet-banner";
import { Reveal } from "@/components/reveal";
import { GlowCard, GlowGrid } from "@/components/ui/glow-card";
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";
import { TIERS } from "@/lib/billing";
import styles from "./landing-homepage.module.css";

const displayFont = localFont({ src: "./fonts/InstrumentSerif-Regular.ttf", weight: "400", style: "normal", display: "swap", variable: "--font-landing-display" });

/* Below-the-fold motion is split into its own chunks; the reserved boxes keep
 * the page from shifting while they load. */
const ShowcaseCarousel = dynamic(() => import("./showcase-section").then(m => m.ShowcaseCarousel), {
  loading: () => <div className={styles.carouselPlaceholder} aria-hidden="true" />,
});
const StepTimeline = dynamic(() => import("@/components/ui/step-timeline").then(m => m.StepTimeline), {
  loading: () => <div className={styles.timelinePlaceholder} aria-hidden="true" />,
});

type Label = (italian: string, english: string) => string;

const NEW_LOOK_NOTICE_KEY = "lavorai:new-look:2026-10:dismissed";
const NEW_LOOK_NOTICE_EXPIRES = Date.parse("2026-10-28T22:59:59Z");

function NewLookAnnouncement({ l }: { l: Label }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const remaining = NEW_LOOK_NOTICE_EXPIRES - Date.now();
    if (remaining <= 0) return;
    try { if (window.localStorage.getItem(NEW_LOOK_NOTICE_KEY) === "1") return; } catch { /* Storage may be unavailable in private browsing. */ }
    setVisible(true);
    const expiry = window.setTimeout(() => setVisible(false), remaining);
    return () => window.clearTimeout(expiry);
  }, []);
  function dismiss() {
    setVisible(false);
    try { window.localStorage.setItem(NEW_LOOK_NOTICE_KEY, "1"); } catch { /* Dismiss for this visit even if storage is blocked. */ }
  }
  if (!visible) return null;
  return <aside className={styles.newLookNotice} aria-labelledby="new-look-title">
    <div className={styles.newLookInner}>
      <p><strong id="new-look-title">{l("LavorAI ha un nuovo look.", "LavorAI has a new look.")}</strong><span>{l("Abbiamo aggiornato il sito, le pagine di accesso e l’anteprima del CV.", "We’ve updated the website, sign-in pages and CV preview.")}</span></p>
      <button type="button" onClick={dismiss} aria-label={l("Chiudi l’avviso sul nuovo look", "Dismiss the new-look announcement")}><X size={17} aria-hidden="true" /></button>
    </div>
  </aside>;
}

function Brand({ large = false }: { large?: boolean }) {
  return <span className={large ? styles.brandLarge : styles.brand}>Lavor<span>AI</span></span>;
}

function Cta({ href = "/signup", children, secondary = false, event = AnalyticsEvent.HERO_CTA_PRIMARY }: {
  href?: string; children: React.ReactNode; secondary?: boolean;
  event?: (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];
}) {
  return <Link href={href} className={`${styles.button} ${styles.buttonGlow} ${secondary ? styles.buttonOutline : ""}`}
    onClick={() => trackEvent(event, { source: "homepage_redesign", href })}>
    {children}<ArrowRight size={18} aria-hidden="true" />
  </Link>;
}

const demoJobs = [
  { title: "Product Manager", company: "Studio North", location: "Milano", type: "Full time", tags: ["Product", "Growth", "Tech"], mark: "N" },
  { title: "UX Designer", company: "Forma Studio", location: "Roma", type: "Hybrid", tags: ["Design", "Research", "UX"], mark: "F" },
  { title: "Data Analyst", company: "Orbit Labs", location: "Remote", type: "Full time", tags: ["Data", "Insights", "Tech"], mark: "O" },
];

function JobPreview({ l }: { l: Label }) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState("");
  const job = demoJobs[index];
  function next(saved: boolean) {
    setFeedback(l(`${job.title}: ${saved ? "selezionata nella demo" : "saltata nella demo"}. Nessuna candidatura inviata.`, `${job.title}: ${saved ? "selected in the demo" : "skipped in the demo"}. No application sent.`));
    setIndex((index + 1) % demoJobs.length);
  }
  return <div className={styles.jobPreview}>
    <span className={styles.exampleBadge}>{l("Demo interattiva · offerte di esempio", "Interactive demo · sample jobs")}</span>
    <div className={styles.cardStack} data-ui="">
      <div className={`${styles.jobCard} ${styles.backCard}`} aria-hidden="true"><Layers size={32} /><p>Digital Designer</p><div className={styles.skeleton} /></div>
      <div className={`${styles.jobCard} ${styles.sideCard}`} aria-hidden="true"><Fingerprint size={28} /><p>UX Researcher</p><span>Milano · Full time</span><b>{l("SALTA", "SKIP")}</b></div>
      <article key={job.mark} className={`${styles.jobCard} ${styles.frontCard}`} aria-label={l("Offerta di esempio", "Sample job")}>
        <div className={styles.companyMark}>{job.mark}</div>
        <div className={styles.jobCardBody}>
          <p className={styles.companyName}>{job.company}</p><h3>{job.title}</h3>
          <div className={styles.jobMeta}><span><MapPin size={12} />{job.location}</span><span><BriefcaseBusiness size={12} />{job.type}</span></div>
          <div className={styles.tags}>{job.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <div className={styles.skeleton}><i /><i /><i /></div>
          <span className={styles.applyStamp}>{l("FA PER TE?", "YOUR NEXT ROLE?")}</span>
        </div>
      </article>
    </div>
    <p className={styles.previewHint}>{l("Scorri le idee. Trova la tua direzione.", "Explore the possibilities. Find your direction.")}</p>
    <div className={styles.swipeActions}>
      <div><button type="button" onClick={() => next(false)} aria-label={l("Salta l’offerta di esempio", "Skip sample job")}><X size={29} /></button><span>{l("Salta", "Skip")}</span></div>
      <div><button type="button" onClick={() => next(true)} aria-label={l("Seleziona l’offerta di esempio", "Select sample job")}><Zap size={27} fill="currentColor" /></button><span>{l("Seleziona", "Select")}</span></div>
    </div>
    <p className={styles.demoFeedback} aria-live="polite">{feedback || l("È una demo: nessuna candidatura viene inviata.", "This is a demo: no applications are sent.")}</p>
  </div>;
}

function ControlPreview({ l }: { l: Label }) {
  const [mode, setMode] = useState<"paused" | "confirmed">("confirmed");
  return <div className={styles.controlPanel} data-ui="">
    <div className={styles.panelHeading}><h3>{l("Modalità di invio", "Submission mode")}</h3><span className={styles.exampleBadge}>{l("Anteprima", "Preview")}</span></div>
    <div className={styles.modeGrid}>
      <button type="button" aria-pressed={mode === "paused"} onClick={() => setMode("paused")} className={mode === "paused" ? styles.modeActive : ""}><Pause size={24} /><strong>{l("In pausa", "Paused")}</strong><span>{l("Nessun nuovo invio", "No new submissions")}</span></button>
      <button type="button" aria-pressed={mode === "confirmed"} onClick={() => setMode("confirmed")} className={mode === "confirmed" ? styles.modeActive : ""}><MessageSquare size={24} /><strong>{l("Con conferma", "With confirmation")}</strong><span>{l("Rivedi ogni candidatura", "Review each application")}</span></button>
      <div className={styles.modeUnavailable}><Zap size={24} /><strong>{l("Automatico", "Automatic")}</strong><span>{l("Soggetto a disponibilità", "Subject to availability")}</span></div>
    </div>
    <div className={styles.controlNotice} aria-live="polite"><ShieldCheck size={20} aria-hidden="true" /><p>{mode === "confirmed" ? l("Prima controlli. Poi confermi.", "Review first. Then confirm.") : l("Fermati quando vuoi.", "Take a break whenever you need.")}<span>{l("Questa anteprima non modifica le impostazioni del tuo account.", "This preview does not change your account settings.")}</span></p></div>
  </div>;
}

export function LandingHomepage() {
  const en = useLocale() === "en";
  const l: Label = (it, english) => en ? english : it;
  const faq = [
    [l("Posso rivedere prima di inviare?", "Can I review before sending?"), l("Sì. Con la modalità con conferma puoi controllare l’offerta e i materiali prima di autorizzare l’invio. Se mancano informazioni, la candidatura deve attendere la tua risposta. Puoi mettere in pausa i nuovi invii dalle preferenze.", "Yes. Confirmation mode lets you review the job and application materials before authorizing submission. If information is missing, the application must wait for your answer. You can pause new submissions in preferences.")],
    [l("Su quali portali funziona?", "Which portals are supported?"), l("La disponibilità dipende dal portale e dall’offerta. LavorAI integra gli ATS supportati e i canali email verificati. Un annuncio trovato su LinkedIn o Indeed non significa che l’invio su quel sito sia disponibile. Non promettiamo un invio riuscito senza una prova verificabile.", "Availability depends on the portal and job. LavorAI integrates supported ATS platforms and verified email channels. A listing found on LinkedIn or Indeed does not mean submission on that site is available. We do not claim a successful submission without verifiable evidence.")],
    [l("Posso provare l’ottimizzazione del CV?", "Can I try CV optimization?"), l("Sì: apri l’analisi CV da questa pagina per provare il percorso di analisi ATS e personalizzazione per un annuncio. Puoi vedere cosa viene migliorato prima di scegliere un piano. Le condizioni del piano vengono mostrate durante l’attivazione.", "Yes: open the CV analysis from this page to try ATS analysis and tailoring for a job. You can see what improves before choosing a plan. Plan conditions are shown during activation.")],
    [l("Una consegna significa che un recruiter ha risposto?", "Does delivery mean a recruiter has replied?"), l("No. Una ricevuta ATS o la consegna al server email documentano l’invio, non una lettura o una risposta. Le risposte ricevute sono tracciate separatamente. LavorAI non garantisce colloqui o risposte da parte delle aziende.", "No. An ATS receipt or delivery to the email server documents submission, not a read or a reply. Received replies are tracked separately. LavorAI does not guarantee interviews or employer replies.")],
    [l("Come vengono usati i miei dati?", "How is my data used?"), l("Il CV viene elaborato per analisi e candidature dai fornitori indicati nell’informativa privacy. Dalle impostazioni puoi esportare i tuoi dati o richiedere l’eliminazione dell’account. Leggi l’informativa per conoscere trattamenti, fornitori e tempi di conservazione.", "Your CV is processed for analysis and applications by the providers listed in the privacy policy. You can export your data or request account deletion in settings. The policy explains processing, providers and retention.")],
  ];
  const plans = [
    { name: "Free", price: "€0", suffix: "", subtitle: l("5 candidature totali, senza scadenza.", "5 lifetime applications, no expiry."), items: [l("Carta obbligatoria, nessun addebito", "Card required, no charges"), l("CV e lettera su misura per ogni posizione", "CV and cover letter tailored to each position"), l("Anteprima prima dell’invio", "Preview before sending"), l("Nessun abbonamento automatico", "No automatic subscription")], cta: l("Scegli Free", "Choose Free"), href: "/signup?plan=free", id: "free" },
    { name: TIERS.pro.name, price: TIERS.pro.priceDisplay.replace(en ? "," : ".", en ? "." : ","), suffix: l("/ mese", "/ month"), subtitle: l("Per dare ritmo alla tua ricerca.", "Build momentum in your search."), items: [l("50 candidature al mese", "50 applications a month"), l("CV e lettera su misura", "Tailored CV and cover letter"), l("Portali e canali supportati", "Supported portals and channels"), l("Statistiche di base", "Basic analytics")], cta: l("Scegli Pro", "Choose Pro"), href: "/signup?plan=pro", id: "pro" },
    { name: TIERS.pro_plus.name, price: TIERS.pro_plus.priceDisplay.replace(".", en ? "." : ","), suffix: l("/ mese", "/ month"), subtitle: l("Più strumenti per il prossimo passo.", "More tools for your next step."), items: [l("Candidature illimitate nel piano*", "Unlimited applications in the plan*"), l("CV e lettera su misura", "Tailored CV and cover letter"), l("Analisi avanzate", "Advanced analytics"), "Founder Interview Coach"], cta: l("Scegli Pro+", "Choose Pro+"), href: "/signup?plan=pro_plus", id: "pro_plus" },
  ];
  const steps = [
    { id: "cv", icon: <FileText size={19} aria-hidden="true" />, title: l("Carica il tuo CV", "Upload your CV"), body: l("Parti dal tuo CV e prova l’analisi.", "Start with your CV and try the analysis.") },
    { id: "explore", icon: <Layers size={19} aria-hidden="true" />, title: l("Scorri le idee.", "Explore the possibilities."), body: l("Trova la tua direzione.", "Find your direction.") },
    { id: "tailor", icon: <PenLine size={19} aria-hidden="true" />, title: l("Un CV su misura.", "A tailored CV."), body: l("Per ogni ruolo.", "For every role.") },
    { id: "confirm", icon: <ShieldCheck size={19} aria-hidden="true" />, title: l("Tu decidi quando inviare.", "You decide when to send."), body: l("Prima controlli. Poi confermi.", "Review first. Then confirm.") },
    { id: "track", icon: <ListChecks size={19} aria-hidden="true" />, title: l("Ogni invio ha una traccia.", "Every submission has a trail."), body: l("Tieni tutto sotto controllo, dalla candidatura alla risposta.", "Keep track of each step, from application to reply.") },
  ];

  return <div className={`${styles.home} ${displayFont.variable}`}>
    <a className={styles.skipLink} href="#main-content">{l("Vai al contenuto", "Skip to content")}</a>
    <NewLookAnnouncement l={l} />
    <main id="main-content">
      <CinematicHero />

      <section id="come-funziona" className={styles.workflow}>
        <div className={styles.container}>
          <Reveal className={styles.centerHeading}><h2>{l("Il prossimo lavoro?", "Your next job?")}<br />{l("Sceglilo con uno swipe.", "A fresh direction.")}</h2></Reveal>
          <StepTimeline steps={steps} label={l("Come funziona", "How it works")} className={styles.timeline} />
          <div className={styles.swipeLayout}>
            <JobPreview l={l} />
            <Reveal className={styles.uploadPanel} delay={0.08}>
              <h3>{l("Carica il tuo CV", "Upload your CV")}<br />{" "}{l("e inizia.", "and get started.")}</h3>
              <Link className={styles.uploadCard} href="/analizza-cv" onClick={() => trackEvent(AnalyticsEvent.LEAD_MAGNET_OPEN, { source: "homepage_upload" })}>
                <span className={styles.uploadIcon} aria-hidden="true"><FileText size={44} strokeWidth={1.2} /></span><strong>CV.pdf</strong>
                <span>{l("Parti dal tuo CV e prova l’analisi.", "Start with your CV and try the analysis.")}</span>
                <span className={styles.uploadAction}>{l("Analizza il CV", "Analyze your CV")}<ArrowRight size={16} /></span>
              </Link>
              <small>PDF · DOCX</small>
            </Reveal>
          </div>
        </div>
      </section>

      <section className={styles.tailoring}>
        <div className={styles.container}>
          <Reveal className={styles.centerHeading}><h2>{l("Un CV su misura.", "A tailored CV.")}<br /><span>{l("Per ogni ruolo.", "For every role.")}</span></h2></Reveal>
          <div className={styles.cvShowcase}>
            <ShowcaseCarousel l={l} jobs={demoJobs} />
            <div className={styles.cvOptions}>
              {[l("Analisi del CV", "CV analysis"), l("CV in DOCX", "CV in DOCX"), l("Lettera di presentazione", "Cover letter")].map((text,i) => <Link key={text} href="#lead-magnet" className={i===0 ? styles.cvOptionActive : ""}><FileText size={18} strokeWidth={1.4} aria-hidden="true" /><span>{text}</span></Link>)}
            </div>
          </div>
          <p className={styles.visualNote}>{l("Anteprima illustrativa · le tue esperienze, valorizzate per l’annuncio.", "Illustrative preview · your experience, tailored to the job.")}</p>
        </div>
      </section>

      <section className={styles.features} aria-labelledby="features-proof-title">
        <div className={styles.container}>
          <GlowGrid className={styles.bento}>
            <GlowCard as="article" className={`${styles.tile} ${styles.tileProof}`}>
              <div className={styles.tileHead}><h2 id="features-proof-title">{l("Ogni invio ha una traccia.", "Every submission has a trail.")}</h2><p className={styles.tileLead}>{l("Tieni tutto sotto controllo, dalla candidatura alla risposta.", "Keep track of each step, from application to reply.")}</p></div>
              <div className={styles.trackingTable} data-ui="">
                <div className={styles.tableCaption}>{l("Anteprima · dati illustrativi", "Preview · illustrative data")}</div>
                <table><thead><tr><th>{l("Azienda", "Company")}</th><th>{l("Ruolo", "Role")}</th><th className={styles.hideSm}>{l("Dati", "Data")}</th><th>{l("Stato", "Status")}</th></tr></thead><tbody>{[
                  { company: "Studio North", role: "Product Manager", mark: "N" },
                  { company: "Forma Studio", role: "UX Designer", mark: "F" },
                  { company: "Orbit Labs", role: "Data Analyst", mark: "O" },
                  { company: "Studio North", role: "Product Analyst", mark: "N" },
                ].map((item,i)=><tr key={`${item.company}-${item.role}`}><td><span className={styles.companyCell}><span className={styles.companyIcon}>{item.mark}</span><span>{item.company}</span></span></td><td>{item.role}</td><td className={styles.hideSm}>{l("Esempio", "Sample")}</td><td><span className={`${styles.status} ${i===2 ? styles.statusReady : ""}`}>{i===2 ? l("Pronta", "Ready") : l("Da rivedere", "To review")}</span></td></tr>)}</tbody></table>
              </div>
              <p className={styles.tileNote}>{l("Una prova di consegna non conferma una lettura, una risposta o un colloquio. Le risposte ricevute sono registrate separatamente.", "Delivery evidence does not confirm a read, reply or interview. Received replies are recorded separately.")} <Link href="/proof">{l("Vedi le prove di consegna", "See delivery evidence")}<ArrowRight size={14} /></Link></p>
            </GlowCard>

            <GlowCard as="article" className={`${styles.tile} ${styles.tileControl}`}>
              <div className={styles.tileHead}><h2>{l("Tu decidi quando inviare.", "You decide when to send.")}</h2><p className={styles.tileLead}>{l("Scegli come gestire le tue candidature.", "Choose how to manage your applications.")}</p></div>
              <ControlPreview l={l} />
              <p className={styles.tileNote}>{l("Gli invii automatici non sono attivi durante la riapertura controllata. Le modalità disponibili dipendono dai controlli attivi e dal canale.", "Automatic submissions are not enabled during the controlled rollout. Available modes depend on active controls and the channel.")}</p>
            </GlowCard>

            <GlowCard as="article" className={`${styles.tile} ${styles.tilePrivacy}`}>
              <h2>{l("Il tuo CV resta sotto il tuo controllo.", "Your CV stays under your control.")}</h2>
              <div className={styles.privacyGrid}>{[
                { icon: ArrowDownToLine, title: l("Esporta i dati", "Export your data"), body: l("Scarica il tuo CV e le tue informazioni dalle impostazioni.", "Download your CV and information in settings."), href: "/settings" },
                { icon: Trash2, title: l("Elimina l’account", "Delete your account"), body: l("Gestisci la richiesta di eliminazione dei tuoi dati.", "Manage your request to delete your data."), href: "/settings" },
                { icon: ShieldCheck, title: l("Leggi la privacy", "Read the privacy policy"), body: l("Scopri come trattiamo i tuoi dati personali.", "See how we process your personal data."), href: "/privacy" },
              ].map(({icon:Icon,title,body,href})=><Link key={title} href={href} className={styles.privacyCard}><span className={styles.privacyIcon}><Icon size={22} aria-hidden="true" /></span><div><h3>{title}</h3><p>{body}</p></div><ArrowRight size={16} aria-hidden="true" className={styles.privacyArrow} /></Link>)}</div>
            </GlowCard>
          </GlowGrid>
        </div>
      </section>

      <div className={styles.leadMagnet}><SectionLeadMagnet /></div>

      <section className={styles.productDemo} aria-labelledby="product-demo-title">
        <div className={styles.container}>
          <Reveal className={styles.demoHeading}>
            <div><h2 id="product-demo-title">{l("Il tuo prossimo passo.", "Your next step.")}<br />{l("Guardalo da vicino.", "Take a closer look.")}</h2><p className={styles.demoKicker}>{l("Dentro LavorAI", "Inside LavorAI")}</p></div>
            <p className={styles.lead}>{l("Dalle offerte al CV su misura, fino al monitoraggio delle candidature. Una panoramica del prodotto, in 34 secondi.", "From opportunities and tailored CVs to application tracking. A 34-second look at the product.")}</p>
          </Reveal>
          <figure className={styles.demoPlayer}>
            <div className={styles.demoFrame}>
              <video controls playsInline preload="none" poster="/lavorai-launch-poster.jpg" aria-label={l("Presentazione di LavorAI", "LavorAI product walkthrough")} aria-describedby="product-demo-caption">
                <source src="/lavorai-launch-demo.mp4" type="video/mp4" />
                <a href="/lavorai-launch-demo.mp4">{l("Apri il video di presentazione", "Open the product video")}</a>
              </video>
            </div>
            <figcaption id="product-demo-caption">{l("Video dimostrativo. Al momento sono disponibili solo candidature confermate manualmente, con un limite temporaneo di 10 tentativi d’invio al giorno complessivi sulla piattaforma. Le promozioni mostrate non confermano le condizioni attive: verifica prezzi e disponibilità prima dell’attivazione.", "Product demo. Only manually confirmed applications are currently available, with a temporary platform-wide limit of 10 submission attempts per day. Promotions shown do not confirm current terms: check pricing and availability before activation.")}</figcaption>
          </figure>
          <details className={styles.demoTranscript}>
            <summary>{l("Descrizione del video", "Video description")}<Plus size={18} aria-hidden="true" /></summary>
            <p>{l("Il video presenta LavorAI attraverso schermate dimostrative: ricerca di opportunità, selezione delle offerte con uno swipe, preparazione di un CV su misura e monitoraggio delle candidature. Una scena illustra la selezione di più offerte e un invio in un clic; la schermata finale mostra il marchio LavorAI e una promozione di tre giorni. Queste scene non confermano la disponibilità attuale: gli invii richiedono conferma manuale, vale il limite temporaneo complessivo indicato sopra e le condizioni effettive sono mostrate prima dell’attivazione.", "The video introduces LavorAI through illustrative screens: finding opportunities, swiping through jobs, preparing a tailored CV and tracking applications. One scene illustrates selecting several jobs and sending in one click; the final screen shows the LavorAI brand and a three-day promotion. These scenes do not confirm current availability: submissions require manual confirmation, the temporary platform-wide limit stated above applies, and actual terms are shown before activation.")}</p>
          </details>
        </div>
      </section>


      <section id="prezzi" className={styles.pricing}>
        <div className={styles.container}>
          <Reveal className={styles.centerHeading}><h2>{l("Prova. Poi scegli.", "Try it. Then choose.")}</h2><p className={styles.lead}>{l("Inizia dall’analisi. Scegli il piano più adatto a te, quando vuoi.", "Start with the analysis. Choose the plan that suits you, when you are ready.")}</p></Reveal>
          <div className={styles.pricingGrid}>{plans.map((plan, index)=><Reveal key={plan.id} delay={index * 0.08} className={styles.planWrap}><article className={`${styles.plan} ${plan.id==="pro" ? styles.planFeatured : ""}`}>
            {plan.id==="pro" && <span className={styles.planBadge}>{l("Il tuo prossimo passo", "Your next step")}</span>}
            <h3>{plan.name}</h3><div className={styles.planPrice}>{plan.price}<span>{plan.suffix}</span></div><p>{plan.subtitle}</p><ul>{plan.items.map(item=><li key={item}><Check size={16} />{item}</li>)}</ul>
            <Link href={plan.href} className={`${styles.button} ${plan.id==="pro" ? styles.buttonGlow : styles.buttonOutline}`} onClick={()=>trackEvent(AnalyticsEvent.PRICING_CTA,{plan:plan.id})}>{plan.cta}</Link>
          </article></Reveal>)}</div>
          <p className={styles.pricingNote}>{l("* Restano applicabili i controlli di sicurezza, la disponibilità dei canali e i limiti operativi. Le condizioni di pagamento e rinnovo vengono mostrate prima dell’attivazione.", "* Safety controls, channel availability and operational limits still apply. Payment and renewal terms are shown before activation.")} <Link href="/termini">{l("Leggi i termini", "Read the terms")}</Link></p>
        </div>
      </section>

      <section id="faq" className={styles.faq}><div className={styles.container}><Reveal className={styles.centerHeading}><h2>{l("Domande frequenti", "Frequently asked questions")}</h2></Reveal><div className={styles.faqList}>{faq.map(([q,a],index)=><details key={q} className={styles.faqItem} onToggle={event=>{if(event.currentTarget.open)trackEvent(AnalyticsEvent.FAQ_EXPAND,{index,question:q})}}><summary><span className={styles.faqQuestion}>{q}</span><span className={styles.faqIcon} aria-hidden="true"><Plus size={18} /></span></summary><p>{a}</p></details>)}</div></div></section>

      <section className={styles.referral}><div className={styles.container}><Link href="/settings" className={styles.referralCard}><span className={styles.referralIcon}><Users size={30} /></span><div><h3>{l("Invita un amico.", "Invite a friend.")}</h3><p>{l("Scopri il programma inviti e le sue condizioni.", "Explore the referral program and its conditions.")}</p></div><span className={styles.button}>{l("Scopri il programma", "Explore the program")}</span></Link></div></section>

      <section className={styles.finalCta}><div className={styles.finalGlow} aria-hidden="true" /><div className={styles.container}><Reveal><h2>{l("Il prossimo passo", "Your next step")}<br />{l("parte da qui.", "starts here.")}</h2><Cta event={AnalyticsEvent.CTA_FINAL}>{l("Crea account", "Get started")}</Cta><Link className={styles.finalCvLink} href="#lead-magnet">{l("Oppure prova il tuo CV", "Or try your CV")}</Link></Reveal></div></section>
    </main>
    <footer className={styles.footer}><div className={styles.container}>
      <div className={styles.footerTop}>
        <div className={styles.footerBrand}><Link href="/" aria-label="LavorAI home"><Brand /></Link><p>{l("Il tuo talento, nuove possibilità.", "Your talent, new possibilities.")}</p></div>
        <nav aria-label="Footer" className={styles.footerNav}><ul>{[{href:"/lavoro",label:l("Offerte","Jobs")},{href:"/guide",label:l("Guide","Guides")},{href:"/proof",label:l("Prove di invio","Delivery evidence")},{href:"/privacy",label:"Privacy"},{href:"/termini",label:l("Termini","Terms")},{href:"/contatti",label:l("Contatti","Contact")}].map(link=><li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}</ul></nav>
      </div>
      <div className={styles.footerWordmark} aria-hidden="true"><Brand large /></div>
      <div className={styles.footerBottom}><p>© 2026 LavorAI · P.IVA 01452520776</p></div>
    </div></footer>
  </div>;
}
