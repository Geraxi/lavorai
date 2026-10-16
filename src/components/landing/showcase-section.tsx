"use client";

import { BriefcaseBusiness, MapPin } from "lucide-react";
import { CardFanCarousel, type CardFanItem } from "@/components/ui/card-fan-carousel";
import styles from "./landing-homepage.module.css";

type Label = (italian: string, english: string) => string;

export type ShowcaseJob = { title: string; company: string; location: string; type: string; tags: string[]; mark: string };

/** The full sample CV (fictional profile), drawn at print width and scaled into the card. */
function CvDocument({ l }: { l: Label }) {
  return <div className={styles.docFrame} data-ui=""><article className={`${styles.cvSheet} ${styles.docScaled}`}>
    <span className={styles.cvExample}>{l("ESEMPIO · PROFILO FITTIZIO", "SAMPLE · FICTIONAL PROFILE")}</span>
    <div className={styles.cvIdentity}>
      <div className={styles.cvTop}>Giulia Rossi</div>
      <h3>Product Designer</h3>
      <p>{l("Milano, Italia", "Milan, Italy")}</p>
    </div>
    <section className={styles.cvSection}>
      <h4>{l("PROFILO", "PROFILE")}</h4>
      <p>{l("Progetto esperienze digitali chiare e accessibili. Unisco ricerca utente, prototipazione e cura dei dettagli per trasformare bisogni complessi in interfacce semplici.", "I design clear, accessible digital experiences. I combine user research, prototyping and attention to detail to turn complex needs into straightforward interfaces.")}</p>
    </section>
    <section className={styles.cvSection}>
      <h4>{l("ESPERIENZE", "EXPERIENCE")}</h4>
      <div className={styles.cvExperience}>
        <div><strong>Product Designer</strong><span>{l("2023 – oggi", "2023 – present")}</span></div>
        <em>Studio Linea</em>
        <p>{l("Flussi di onboarding e prototipi per un servizio digitale. Interviste agli utenti e collaborazione con gli sviluppatori per il rilascio delle interfacce.", "Onboarding flows and prototypes for a digital service. User interviews and collaboration with developers to ship interface designs.")}</p>
      </div>
      <div className={styles.cvExperience}>
        <div><strong>Junior UX Designer</strong><span>2021 – 2023</span></div>
        <em>Atelier Digitale</em>
        <p>{l("Wireframe, test di usabilità e componenti di un design system. Documentazione dei pattern e verifica dei requisiti di accessibilità.", "Wireframes, usability testing and design system components. Pattern documentation and accessibility requirements reviews.")}</p>
      </div>
    </section>
    <section className={styles.cvSection}>
      <h4>{l("COMPETENZE", "SKILLS")}</h4>
      <div className={styles.cvSkills}>{["Figma", l("Prototipazione", "Prototyping"), l("Ricerca utente", "User research"), l("Accessibilità", "Accessibility")].map(skill => <span key={skill}>{skill}</span>)}</div>
    </section>
    <section className={styles.cvSection}>
      <h4>{l("FORMAZIONE", "EDUCATION")}</h4>
      <p><strong>{l("Laurea in Design della comunicazione", "BA in Communication Design")}</strong><br />{l("Percorso universitario · 2021", "University studies · 2021")}</p>
    </section>
    <p className={styles.cvSampleNote}>{l("Nome, aziende ed esperienze sono inventati a scopo illustrativo.", "Name, companies and experience are fictional and for illustration only.")}</p>
  </article></div>;
}

/** Cover-letter mockup in the cv-mockup paper style; body lines are skeletons, not copy. */
function CoverLetterDocument({ l, job }: { l: Label; job: ShowcaseJob }) {
  return <div className={styles.docFrame} data-ui=""><article className={`${styles.cvSheet} ${styles.docScaled}`}>
    <span className={styles.cvExample}>{l("ESEMPIO · PROFILO FITTIZIO", "SAMPLE · FICTIONAL PROFILE")}</span>
    <div className={styles.cvIdentity}>
      <div className={styles.cvTop}>Giulia Rossi</div>
      <h3>{l("Lettera di presentazione", "Cover letter")}</h3>
      <p>{job.company} · {job.title}</p>
    </div>
    <div className={styles.letterLines} aria-hidden="true">
      {[96, 88, 92, 70, 0, 94, 90, 84, 97, 62, 0, 91, 86, 58].map((width, index) => width === 0 ? <br key={index} /> : <i key={index} style={{ width: `${width}%` }} className={index === 6 || index === 7 ? styles.letterHighlight : undefined} />)}
    </div>
    <div className={styles.cvSkills}>{job.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
    <p className={styles.cvSampleNote}>{l("Nome, aziende ed esperienze sono inventati a scopo illustrativo.", "Name, companies and experience are fictional and for illustration only.")}</p>
  </article></div>;
}

function JobMock({ l, job }: { l: Label; job: ShowcaseJob }) {
  return <article className={styles.showcaseJob} data-ui="">
    <span className={styles.exampleChip}>{l("Offerta di esempio", "Sample job")}</span>
    <div className={styles.companyMark}>{job.mark}</div>
    <div className={styles.jobCardBody}>
      <p className={styles.companyName}>{job.company}</p><h3>{job.title}</h3>
      <div className={styles.jobMeta}><span><MapPin size={12} aria-hidden="true" />{job.location}</span><span><BriefcaseBusiness size={12} aria-hidden="true" />{job.type}</span></div>
      <div className={styles.tags}>{job.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
      <div className={styles.skeleton} aria-hidden="true"><i /><i /><i /></div>
      <span className={styles.applyStamp}>{l("FA PER TE?", "YOUR NEXT ROLE?")}</span>
    </div>
  </article>;
}

function TrackingMock({ l, jobs }: { l: Label; jobs: ShowcaseJob[] }) {
  return <article className={styles.showcaseTrack} data-ui="">
    <span className={styles.exampleChip}>{l("Anteprima · dati illustrativi", "Preview · illustrative data")}</span>
    <h3>{l("Ogni invio ha una traccia.", "Every submission has a trail.")}</h3>
    <ol>{jobs.map((job, index) => <li key={job.title}>
      <span className={styles.companyIcon}>{job.mark}</span>
      <span className={styles.trackText}><b>{job.company}</b><small>{job.title}</small></span>
      <span className={`${styles.status} ${index === 2 ? styles.statusReady : ""}`}>{index === 2 ? l("Pronta", "Ready") : l("Da rivedere", "To review")}</span>
    </li>)}</ol>
  </article>;
}

export function ShowcaseCarousel({ l, jobs }: { l: Label; jobs: ShowcaseJob[] }) {
  const items: CardFanItem[] = [
    { id: "cover", label: l("Lettera di presentazione", "Cover letter"), content: <CoverLetterDocument l={l} job={jobs[0]} /> },
    ...jobs.slice(0, 2).map(job => ({ id: `job-${job.mark}`, label: `${job.title} · ${job.company}`, content: <JobMock l={l} job={job} /> })),
    { id: "cv", label: l("CV di esempio · profilo fittizio", "Sample CV · fictional profile"), content: <CvDocument l={l} /> },
    { id: `job-${jobs[2].mark}`, label: `${jobs[2].title} · ${jobs[2].company}`, content: <JobMock l={l} job={jobs[2]} /> },
    { id: "tracking", label: l("Anteprima · dati illustrativi", "Preview · illustrative data"), content: <TrackingMock l={l} jobs={jobs} /> },
  ];
  return <CardFanCarousel
    items={items}
    initialIndex={3}
    label={l("Anteprima illustrativa", "Illustrative preview")}
    previousLabel={l("Precedente", "Previous")}
    nextLabel={l("Successiva", "Next")}
    positionLabel={(index, total) => l(`${index + 1} di ${total}`, `${index + 1} of ${total}`)}
    goToLabel={(item) => l(`Mostra: ${item.label}`, `Show: ${item.label}`)}
  />;
}
