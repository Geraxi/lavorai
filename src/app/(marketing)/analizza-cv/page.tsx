import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { getTranslations } from "next-intl/server";
import { ArrowRight, FileText, Mail, SlidersHorizontal, Sparkles } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import styles from "./page.module.css";

const displayFont = localFont({ src: "../../../components/landing/fonts/InstrumentSerif-Regular.ttf", weight: "400", display: "swap", variable: "--font-cv-display" });

export const metadata: Metadata = {
  title: "Analizza il tuo CV · LavorAI",
  description: "Parti dal tuo CV: caricalo, accedi dal link ricevuto via email e completa il tuo profilo su LavorAI.",
  alternates: { canonical: "/analizza-cv" },
};

/** Public introduction only. Upload, consent and authentication remain in /optimize. */
export default async function AnalizzaCvLanding() {
  const t = await getTranslations("analizzaCvPage");
  const nav = await getTranslations("nav");
  const footer = await getTranslations("footer");
  const icons = [FileText, Mail, SlidersHorizontal];

  return <div className={`${styles.page} ${displayFont.variable}`}>
    <a className={styles.skip} href="#cv-main">{t("skip")}</a>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="LavorAI">Lavor<span>AI</span></Link>
      <nav className={styles.nav} aria-label={t("navigation")}>
        <Link href="/#come-funziona" className={styles.desktopLink}>{nav("howItWorks")}</Link>
        <Link href="/#prezzi" className={styles.desktopLink}>{nav("pricing")}</Link>
        <LanguageSwitcher />
        <Link href="/login" className={styles.login}>{nav("login")}</Link>
      </nav>
    </header>
    <main id="cv-main">
      <section className={styles.hero} aria-labelledby="cv-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}><Sparkles size={14} aria-hidden="true" />{t("badge")}</p>
          <h1 id="cv-title">{t("title1")}<span>{t("title2")}</span></h1>
          <p className={styles.lead}>{t("subtitle")}</p>
          <Link className={styles.textLink} href="/signup">{t("ctaSecondary")}<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className={styles.uploadPanel}>
          <h2>{t("uploadTitle")}</h2>
          <div className={styles.uploadCard}>
            <FileText size={52} strokeWidth={1.3} aria-hidden="true" />
            <span className={styles.fileName}>CV.pdf</span>
            <p>{t("uploadBody")}</p>
            <Link className={styles.button} href="/optimize">{t("cta")}<ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          <p className={styles.caption}>{t("caption")}</p>
        </div>
      </section>
      <section className={styles.stepsSection} aria-labelledby="cv-steps">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>{t("getEyebrow")}</p>
          <h2 id="cv-steps">{t("howTitle")}</h2>
          <p>{t("howBody")}</p>
        </div>
        <ol className={styles.steps}>
          {(["step1", "step2", "step3"] as const).map((key, index) => {
            const StepIcon = icons[index];
            return <li key={key}><div className={styles.stepTop}><StepIcon size={24} strokeWidth={1.5} aria-hidden="true" /><span>0{index + 1}</span></div><h3>{t(`${key}Title`)}</h3><p>{t(key)}</p></li>;
          })}
        </ol>
      </section>
      <section className={styles.final} aria-labelledby="cv-final">
        <h2 id="cv-final">{t("finalTitle")}</h2>
        <Link className={styles.button} href="/optimize">{t("cta")}<ArrowRight size={17} aria-hidden="true" /></Link>
      </section>
    </main>
    <footer className={styles.footer}>
      <Link href="/" className={styles.brand}>Lavor<span>AI</span></Link>
      <div><Link href="/privacy">{footer("privacy")}</Link><Link href="/termini">{footer("terms")}</Link><Link href="/contatti">{footer("contact")}</Link></div>
    </footer>
  </div>;
}
