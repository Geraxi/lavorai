"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale } from "next-intl";
import {
  ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, BriefcaseBusiness,
  Check, CheckCircle2, ChevronRight, Circle, FileText, Fingerprint, Layers,
  MapPin, MessageSquare, Pause, Plus, ShieldCheck, Trash2, Users, X, Zap,
} from "lucide-react";
import { CinematicHero } from "./cinematic-hero";
import { SectionLeadMagnet } from "@/components/sections/lead-magnet-banner";
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";
import { TIERS } from "@/lib/billing";
import styles from "./landing-homepage.module.css";

type Label = (italian: string, english: string) => string;

function Brand({ large = false }: { large?: boolean }) {
  return <span className={large ? styles.brandLarge : styles.brand}>Lavor<span>AI</span></span>;
}

function SectionLabel({ number, children }: { number: string; children: React.ReactNode }) {
  return <div className={styles.sectionLabel}><span>{number}</span><span>{children}</span><span className={styles.rule} /></div>;
}

function Cta({ href = "/signup", children, secondary = false, event = AnalyticsEvent.HERO_CTA_PRIMARY }: {
  href?: string; children: React.ReactNode; secondary?: boolean;
  event?: (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];
}) {
  return <Link href={href} className={`${styles.button} ${secondary ? styles.buttonOutline : ""}`}
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
    <div className={styles.cardStack}>
      <div className={`${styles.jobCard} ${styles.backCard}`} aria-hidden="true"><Layers size={32} /><p>Digital Designer</p><div className={styles.skeleton} /></div>
      <div className={`${styles.jobCard} ${styles.sideCard}`} aria-hidden="true"><Fingerprint size={28} /><p>UX Researcher</p><span>Milano · Full time</span><b>{l("SALTA", "SKIP")}</b></div>
      <article className={`${styles.jobCard} ${styles.frontCard}`} aria-label={l("Offerta di esempio", "Sample job")}>
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

function CvPreview({ l }: { l: Label }) {
  return <div className={styles.cvStack} aria-label={l("Anteprima illustrativa di un CV", "Illustrative CV preview")}>
    <div className={styles.cvSheet}>
      <div className={styles.cvTop}><FileText size={18} /><span>{l("Il tuo CV", "Your CV")}</span><span className={styles.cvDot} /></div>
      <h3>{l("Il tuo prossimo capitolo.", "Your next chapter.")}</h3>
      {[l("PROFILO", "PROFILE"), l("ESPERIENZE", "EXPERIENCE"), l("COMPETENZE", "SKILLS"), l("FORMAZIONE", "EDUCATION")].map((title, i) => <div className={styles.cvBlock} key={title}><b>{title}</b><i /><i /><i className={i === 1 ? styles.highlightLine : ""} /></div>)}
      <span className={styles.cvFoot}>{l("Le tue esperienze, messe a fuoco.", "Your experience, brought into focus.")}</span>
    </div>
  </div>;
}

function ControlPreview({ l }: { l: Label }) {
  const [mode, setMode] = useState<"paused" | "confirmed">("confirmed");
  return <div className={styles.controlPanel}>
    <div className={styles.panelHeading}><h3>{l("Modalità di invio", "Submission mode")}</h3><span className={styles.exampleBadge}>{l("Anteprima", "Preview")}</span></div>
    <div className={styles.modeGrid}>
      <button type="button" aria-pressed={mode === "paused"} onClick={() => setMode("paused")} className={mode === "paused" ? styles.modeActive : ""}><Pause size={29} /><strong>{l("In pausa", "Paused")}</strong><span>{l("Nessun nuovo invio", "No new submissions")}</span></button>
      <button type="button" aria-pressed={mode === "confirmed"} onClick={() => setMode("confirmed")} className={mode === "confirmed" ? styles.modeActive : ""}><MessageSquare size={29} /><strong>{l("Con conferma", "With confirmation")}</strong><span>{l("Rivedi ogni candidatura", "Review each application")}</span></button>
      <div className={styles.modeUnavailable}><Zap size={29} /><strong>{l("Automatico", "Automatic")}</strong><span>{l("Soggetto a disponibilità", "Subject to availability")}</span></div>
    </div>
    <div className={styles.controlNotice} aria-live="polite"><ShieldCheck size={23} /><p>{mode === "confirmed" ? l("Prima controlli. Poi confermi.", "Review first. Then confirm.") : l("Fermati quando vuoi.", "Take a break whenever you need.")}<span>{l("Questa anteprima non modifica le impostazioni del tuo account.", "This preview does not change your account settings.")}</span></p></div>
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
    { name: l("Analisi CV", "CV analysis"), price: "€0", suffix: "", subtitle: l("Il primo passo, con il tuo CV.", "Your first step, with your CV."), items: [l("Analisi della leggibilità ATS", "ATS readability analysis"), l("Anteprima del CV su misura", "Tailored CV preview"), l("Suggerimenti per migliorare", "Suggestions to improve")], cta: l("Analizza il CV", "Analyze your CV"), href: "/analizza-cv", id: "cv_analysis" },
    { name: TIERS.pro.name, price: TIERS.pro.priceDisplay.replace(".", en ? "." : ","), suffix: l("/ mese", "/ month"), subtitle: l("Per dare ritmo alla tua ricerca.", "Build momentum in your search."), items: [l("50 candidature al mese", "50 applications a month"), l("CV e lettera su misura", "Tailored CV and cover letter"), l("Portali e canali supportati", "Supported portals and channels"), l("Statistiche di base", "Basic analytics")], cta: l("Scegli Pro", "Choose Pro"), href: "/signup?plan=pro", id: "pro" },
    { name: TIERS.pro_plus.name, price: TIERS.pro_plus.priceDisplay.replace(".", en ? "." : ","), suffix: l("/ mese", "/ month"), subtitle: l("Più strumenti per il prossimo passo.", "More tools for your next step."), items: [l("Candidature illimitate nel piano*", "Unlimited applications in the plan*"), l("CV e lettera su misura", "Tailored CV and cover letter"), l("Analisi avanzate", "Advanced analytics"), "Founder Interview Coach"], cta: l("Scegli Pro+", "Choose Pro+"), href: "/signup?plan=pro_plus", id: "pro_plus" },
  ];


  return <div className={styles.home}>
    <a className={styles.skipLink} href="#main-content">{l("Vai al contenuto", "Skip to content")}</a>
    <main id="main-content">
      <CinematicHero />

      <section id="come-funziona" className={`${styles.light} ${styles.workflow}`}>
        <div className={`${styles.container} ${styles.twoColumns}`}>
          <div><SectionLabel number="01">{l("Carica il CV", "Upload your CV")}</SectionLabel><h2>{l("Il prossimo lavoro?", "Your next job?")}<br />{l("Sceglilo con uno swipe.", "A fresh direction.")}</h2><p className={styles.lead}>{l("Parti dalle tue esperienze. Esplora le opportunità e scegli quelle che ti interessano.", "Start with your experience. Explore opportunities and choose the ones that interest you.")}</p>
            <Link className={styles.uploadCard} href="/analizza-cv" onClick={() => trackEvent(AnalyticsEvent.LEAD_MAGNET_OPEN, { source: "homepage_upload" })}><div className={styles.fileTile}><FileText size={30} /><span>cv.pdf</span></div><div><strong>{l("Il tuo prossimo passo è qui", "Your next step starts here")}</strong><span>{l("Carica il CV e prova l’analisi", "Upload your CV and try the analysis")}</span><small>PDF · DOCX</small></div><ArrowUpRight size={22} /></Link>
          </div>
          <div><SectionLabel number="02">{l("Scegli le offerte", "Choose your opportunities")}</SectionLabel><JobPreview l={l} /></div>
        </div>
      </section>

      <section className={`${styles.dark} ${styles.tailoring}`}>
        <div className={styles.container}>
          <div className={styles.twoColumns}>
            <div><SectionLabel number="03">{l("CV su misura", "A tailored CV")}</SectionLabel><h2>{l("Una candidatura.", "One application.")}<br />{l("Fatta per quel ruolo.", "Made for that role.")}</h2><p className={styles.lead}>{l("LavorAI adatta il tuo CV a ogni opportunità, valorizzando le esperienze più rilevanti. Sempre le tue.", "LavorAI tailors your CV to each opportunity, bringing your most relevant experience forward. Always your own.")}</p><CvPreview l={l} /></div>
            <div className={styles.applicationPreview}><span className={styles.exampleBadge}>{l("Esempio illustrativo", "Illustrative example")}</span><h3>{l("Le tue candidature", "Your applications")}</h3>{["Product Manager", "Product Analyst", "Digital Product Manager", "UX Designer"].map((title, i) => <div className={styles.applicationRow} key={title}><span className={styles.appIcon}>{i % 2 ? <Fingerprint /> : <Layers />}</span><div><strong>{title}</strong><small>{l("Milano · Full time", "Milan · Full time")}</small></div><span className={`${styles.status} ${i === 2 ? styles.statusReady : ""}`}>{i === 2 ? l("Pronta", "Ready") : l("Da rivedere", "To review")}</span><ChevronRight size={15} /></div>)}<p className={styles.smallNote}>{l("Controlla i materiali e i dettagli prima di procedere.", "Check the materials and details before proceeding.")}</p><Link className={styles.textLink} href="#lead-magnet">{l("Prova l’ottimizzazione del CV", "Try CV optimization")}<ArrowRight size={16} /></Link></div>
          </div>
          <div className={styles.brandBand}><Brand large /><div><p>{l("Il prossimo passo", "Your next step")}<br />{l("parte da qui.", "starts here.")}</p><Cta href="#lead-magnet" secondary>{l("Prova il tuo CV", "Try your CV")}</Cta></div></div>
        </div>
      </section>

      <section className={`${styles.dark} ${styles.control}`}>
        <div className={`${styles.container} ${styles.twoColumns}`}>
          <div><SectionLabel number="04">{l("Tutto sotto controllo", "You are in control")}</SectionLabel><h2>{l("Il controllo.", "Your search.")}<br />{l("Sempre tuo.", "Your rules.")}</h2><p className={styles.lead}>{l("Scegli cosa inviare. Metti in pausa quando vuoi.", "Choose what to send. Pause whenever you want.")}</p><p className={styles.controlFootnote}>{l("Le modalità disponibili dipendono dai controlli attivi e dal canale. Gli invii automatici non sono attivi durante la riapertura controllata.", "Available modes depend on active controls and the channel. Automatic submissions are not enabled during the controlled rollout.")}</p></div><ControlPreview l={l} />
        </div>
      </section>

      <section className={`${styles.light} ${styles.proof}`}>
        <div className={styles.container}>
          <SectionLabel number="05">{l("Ogni invio ha una traccia", "Every submission has a trail")}</SectionLabel>
          <div className={styles.proofHeading}><h2>{l("Ogni passo,", "Every step,")}<br />{l("nero su bianco.", "clearly documented.")}</h2><p className={styles.lead}>{l("Segui lo stato delle tue candidature. Prove di invio e risposte ricevute restano due cose distinte.", "Follow your applications. Submission evidence and received replies remain two separate things.")}</p></div>
          <div className={styles.receiptFrame}>
            <ol className={styles.timeline}>
              <li><CheckCircle2 /><div><strong>{l("Materiali preparati", "Materials prepared")}</strong><span>{l("CV e lettera su misura", "Tailored CV and cover letter")}</span></div></li>
              <li><CheckCircle2 /><div><strong>{l("Consegna verificata", "Verified delivery")}</strong><span>{l("Solo con una prova disponibile", "Only when evidence is available")}</span></div></li>
              <li className={styles.timelinePending}><Circle /><div><strong>{l("Risposta dell’azienda", "Employer reply")}</strong><span>{l("Uno stato separato dalla consegna", "A separate status from delivery")}</span></div></li>
            </ol>
            <div className={styles.receipt}><span className={styles.exampleBadge}>{l("Esempio di ricevuta · dati illustrativi", "Sample receipt · illustrative data")}</span><div className={styles.receiptTitle}><span className={styles.receiptIcon}><Check size={21} /></span><div><strong>{l("Consegna al server email", "Delivery to the email server")}</strong><small>{l("Evento tecnico di consegna", "Technical delivery event")}</small></div></div><dl><div><dt>{l("Canale", "Channel")}</dt><dd>Email</dd></div><div><dt>{l("Prova", "Evidence")}</dt><dd>{l("Evento del provider", "Provider event")}</dd></div><div><dt>{l("Risposta recruiter", "Recruiter reply")}</dt><dd>{l("Non dimostrata da questa ricevuta", "Not demonstrated by this receipt")}</dd></div></dl><p>{l("Una consegna non conferma una lettura, una risposta o un colloquio. Le risposte reali vengono registrate separatamente.", "Delivery does not confirm a read, reply or interview. Actual replies are recorded separately.")}</p><Link className={styles.textLink} href="/proof">{l("Vedi le prove di consegna", "See delivery evidence")}<ArrowRight size={17} /></Link></div>
          </div>
        </div>
      </section>

      <section className={`${styles.light} ${styles.privacy}`}>
        <div className={styles.container}><SectionLabel number="06">{l("La tua privacy", "Your privacy")}</SectionLabel><div className={styles.privacyHeading}><h2>{l("Il tuo CV resta", "Your CV stays")}<br />{l("sotto il tuo controllo.", "under your control.")}</h2><p className={styles.lead}>{l("I tuoi dati sono al sicuro. Puoi esportarli, richiederne l’eliminazione e leggere come li trattiamo.", "Keep control of your data. Export it, request deletion and understand how it is processed.")}</p></div><div className={styles.privacyGrid}>{[
          { icon: ArrowDownToLine, title: l("Esporta i dati", "Export your data"), body: l("Scarica il tuo CV e le tue informazioni dalle impostazioni.", "Download your CV and information in settings."), href: "/settings" },
          { icon: Trash2, title: l("Elimina l’account", "Delete your account"), body: l("Gestisci la richiesta di eliminazione dei tuoi dati.", "Manage your request to delete your data."), href: "/settings" },
          { icon: ShieldCheck, title: l("Leggi la privacy", "Read the privacy policy"), body: l("Scopri come trattiamo i tuoi dati personali.", "See how we process your personal data."), href: "/privacy" },
        ].map(({ icon: Icon, title, body, href }) => <Link key={title} href={href} className={styles.privacyCard}><Icon size={25} /><ArrowUpRight size={18} className={styles.cardArrow} /><h3>{title}</h3><p>{body}</p></Link>)}</div></div>
      </section>

      <div className={styles.leadMagnet}><SectionLeadMagnet /></div>

      <section id="prezzi" className={`${styles.light} ${styles.pricing}`}>
        <div className={styles.container}><SectionLabel number="07">{l("Scegli il piano", "Choose your plan")}</SectionLabel><div className={styles.pricingHeading}><div><h2>{l("Il tuo CV. Il tuo ritmo.", "Your CV. Your pace.")}</h2><p className={styles.lead}>{l("Inizia dall’analisi. Scegli come continuare.", "Start with the analysis. Choose where to go next.")}</p></div><span className={styles.handNote}>{l("Il prossimo passo?", "The next step?")}<br />{l("Lo scegli tu.", "You choose it.")}<ArrowDown size={23} /></span></div><div className={styles.pricingGrid}>{plans.map(plan => <article key={plan.id} className={`${styles.plan} ${plan.id === "pro_plus" ? styles.planFeatured : ""}`}>{plan.id === "pro_plus" && <span className={styles.planBadge}>{l("Più strumenti", "More tools")}</span>}<h3>{plan.name}</h3><div className={styles.planPrice}>{plan.price}<span>{plan.suffix}</span></div><p>{plan.subtitle}</p><ul>{plan.items.map(item => <li key={item}><Check size={18} />{item}</li>)}</ul><Link href={plan.href} className={`${styles.button} ${plan.id === "pro_plus" ? "" : styles.buttonOutline}`} onClick={() => trackEvent(AnalyticsEvent.PRICING_CTA, { plan: plan.id })}>{plan.cta}<ArrowRight size={17} /></Link></article>)}</div><p className={styles.pricingNote}>{l("* Restano applicabili i controlli di sicurezza, la disponibilità dei canali e i limiti operativi. Le condizioni di pagamento e rinnovo vengono mostrate prima dell’attivazione.", "* Safety controls, channel availability and operational limits still apply. Payment and renewal terms are shown before activation.")}<br /><Link href="/termini">{l("Leggi i termini", "Read the terms")}</Link></p></div>
      </section>

      <section id="faq" className={`${styles.light} ${styles.faq}`}><div className={styles.container}><SectionLabel number="08">{l("Domande frequenti", "Frequently asked questions")}</SectionLabel><div className={styles.faqHeading}><h2>FAQ.</h2><p>{l("Hai altre domande?", "More questions?")}<Link className={styles.textLink} href="/contatti">{l("Contattaci", "Contact us")}<ArrowRight size={17} /></Link></p></div><div className={styles.faqList}>{faq.map(([q, a], index) => <details key={q} onToggle={event => { if (event.currentTarget.open) trackEvent(AnalyticsEvent.FAQ_EXPAND, { index, question: q }); }}><summary>{q}<Plus size={20} /></summary><p>{a}</p></details>)}</div></div></section>

      <section className={`${styles.light} ${styles.referral}`}><div className={styles.container}><SectionLabel number="09">{l("Porta un amico", "Bring a friend")}</SectionLabel><Link href="/settings" className={styles.referralCard}><span className={styles.referralIcon}><Users size={34} /></span><div><h3>{l("I prossimi passi sono più belli insieme.", "The next chapter is better together.")}</h3><p>{l("Scopri il programma inviti e le sue condizioni.", "Explore the referral program and its conditions.")}</p></div><span className={styles.textLink}>{l("Scopri il programma", "Explore the program")}<ArrowRight size={18} /></span></Link></div></section>

      <section className={styles.finalCta}><div className={styles.finalImage} aria-hidden="true" /><div className={styles.container}><h2>{l("Il prossimo passo", "Your next step")}<br />{l("parte da qui.", "starts here.")}</h2><Cta event={AnalyticsEvent.CTA_FINAL}>{l("Crea account", "Get started")}</Cta><Link className={styles.finalCvLink} href="#lead-magnet">{l("Oppure prova il tuo CV", "Or try your CV")}</Link></div></section>
    </main>
    <footer className={styles.footer}><div className={styles.container}><div className={styles.footerTop}><Link href="/" aria-label="LavorAI home"><Brand /></Link><nav aria-label="Footer">{[{ href: "/lavoro", label: l("Offerte", "Jobs") }, { href: "/guide", label: l("Guide", "Guides") }, { href: "/proof", label: l("Prove di invio", "Delivery evidence") }, { href: "/privacy", label: "Privacy" }, { href: "/termini", label: l("Termini", "Terms") }, { href: "/contatti", label: l("Contatti", "Contact") }].map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav></div><div className={styles.footerBottom}><p>© 2026 LavorAI · P.IVA 01452520776</p><p>{l("Il tuo talento, nuove possibilità.", "Your talent, new possibilities.")}</p></div></div></footer>
  </div>;
}
