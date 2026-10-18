"use client";

import { getImageProps } from "next/image";
import type { ReactNode } from "react";
import { AppWindow, BadgeCheck, Clock, Layers, MailQuestion, PenLine } from "lucide-react";
import { Reveal } from "./landing-reveal";
import { GlowCard, GlowGrid } from "@/components/ui/glow-card";
import styles from "./landing-homepage.module.css";

type Label = (italian: string, english: string) => string;

/**
 * Problem → solution bridge between the hero and "how it works".
 * The photo is art-directed: a tighter 4:3 crop on phones, the full 16:9
 * scene from tablet up. Both go through the Next image optimizer, lazily.
 */
function OverwhelmPicture({ l }: { l: Label }) {
  const alt = l(
    "Una persona stremata alla scrivania di notte, circondata da annunci di lavoro e CV da riadattare",
    "An exhausted person at a desk at night, surrounded by job listings and CVs waiting to be rewritten",
  );
  const sizes = "(max-width: 850px) calc(100vw - 32px), 720px";
  const common = { alt, sizes, loading: "lazy" as const };
  const { props: { srcSet: mobileSrcSet } } = getImageProps({ ...common, src: "/landing/job-search-overwhelm-800.webp", width: 800, height: 600 });
  const { props: desktop } = getImageProps({ ...common, src: "/landing/job-search-overwhelm.webp", width: 1600, height: 901 });
  return <picture>
    <source media="(max-width: 700px)" srcSet={mobileSrcSet} sizes={sizes} width={800} height={600} />
    <source media="(min-width: 701px)" srcSet={desktop.srcSet} sizes={sizes} width={1600} height={901} />
    {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- getImageProps output (next/image art direction); alt is set above. */}
    <img {...desktop} className={styles.problemImage} />
  </picture>;
}

export function ProblemSection({ l, cta }: { l: Label; cta: ReactNode }) {
  const pains = [
    { icon: Clock, text: l("Ore passate a riscrivere lo stesso CV", "Hours spent rewriting the same CV") },
    { icon: AppWindow, text: l("Annunci sparsi tra LinkedIn, Indeed e decine di siti", "Listings scattered across LinkedIn, Indeed and dozens of sites") },
    { icon: MailQuestion, text: l("Candidature inviate nel vuoto, senza sapere se sono arrivate", "Applications sent into the void, never knowing if they arrived") },
  ];
  const answers = [
    { icon: PenLine, title: l("Un CV su misura per ogni annuncio", "A tailored CV for every listing"), body: l("Le tue esperienze, valorizzate per ogni posizione. Senza ricominciare da capo.", "Your experience, tailored to each role. Without starting over.") },
    { icon: Layers, title: l("Le offerte in un unico posto", "Opportunities in one place"), body: l("Scorri le opportunità adatte al tuo profilo e scegli dove candidarti.", "Explore opportunities that fit your profile and choose where to apply.") },
    { icon: BadgeCheck, title: l("Una prova per ogni invio", "Evidence for every submission"), body: l("Ricevuta ATS o consegna email: sai che la candidatura è partita.", "ATS receipt or email delivery: you know your application went out.") },
  ];

  return <section id="il-problema" className={styles.problem} aria-labelledby="problem-title">
    <div className={styles.container}>
      <div className={styles.problemLayout}>
        <Reveal className={styles.problemCopy}>
          <p className={styles.problemKicker}>{l("Il problema", "The problem")}</p>
          <h2 id="problem-title">{l("Dieci schede aperte. Un CV da riscrivere per ognuna. E nessuna risposta.", "Ten tabs open. A CV to rewrite for each one. And no reply.")}</h2>
          <p className={styles.lead}>{l(
            "Ogni annuncio ti chiede di adattare il CV, inseguire le parole chiave giuste e ricominciare da capo. Dopo settimane così, cercare lavoro diventa un secondo lavoro, e la fiducia si consuma un rifiuto alla volta.",
            "Every listing asks you to adapt your CV, chase the right keywords and start over. After weeks of this, looking for a job becomes a second job, and your confidence wears down one rejection at a time.",
          )}</p>
          <ul className={styles.painList}>{pains.map(({ icon: Icon, text }) => <li key={text}><span className={styles.painIcon} aria-hidden="true"><Icon size={18} /></span>{text}</li>)}</ul>
        </Reveal>
        <Reveal className={styles.problemFigure} delay={0.08}>
          <figure><OverwhelmPicture l={l} /></figure>
        </Reveal>
      </div>

      <div className={styles.problemBridge} aria-hidden="true" />

      <Reveal className={`${styles.centerHeading} ${styles.solutionHeading}`}>
        <p className={styles.problemKicker}>{l("La soluzione", "The solution")}</p>
        <h2>{l("Il lavoro pesante lo fa LavorAI.", "LavorAI does the heavy lifting.")}<br /><span>{l("Tu decidi quando inviare.", "You decide when to send.")}</span></h2>
        <p className={styles.lead}>{l(
          "Trova gli annunci adatti al tuo profilo, adatta il CV a ogni posizione e prepara le candidature per te. Tu confermi l’invio, e ogni invio ha una traccia.",
          "It finds listings that fit your profile, tailors your CV to each role and prepares your applications. You confirm before sending, and every submission has a trail.",
        )}</p>
      </Reveal>
      <GlowGrid className={styles.solutionGrid}>{answers.map(({ icon: Icon, title, body }, index) => <Reveal key={title} delay={index * 0.08} className={styles.solutionWrap}>
        <GlowCard as="article" className={styles.solutionCard}>
          <span className={styles.privacyIcon} aria-hidden="true"><Icon size={22} /></span>
          <div><h3>{title}</h3><p>{body}</p></div>
        </GlowCard>
      </Reveal>)}</GlowGrid>
      <div className={styles.solutionCta}>{cta}</div>
    </div>
  </section>;
}
