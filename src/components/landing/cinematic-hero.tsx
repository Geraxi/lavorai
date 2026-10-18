"use client";

import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { ArrowDown, Menu, Pause, Play, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";
import styles from "./cinematic-hero.module.css";

const instrumentSerif = localFont({
  src: "./fonts/InstrumentSerif-Regular.ttf",
  weight: "400",
  style: "normal",
  display: "swap",
});

const VIDEO_URL = "/lavorai-hero-starry-sky.mp4";
const POSTER_URL = "/lavorai-hero-starry-sky-poster.jpg";

/** Decorative video: respect reduced motion before loading it and keep a
 * locally hosted still visible when autoplay or the remote video is unavailable. */
export function CinematicHero() {
  const en = useLocale() === "en";
  const l = (it: string, english: string) => en ? english : it;
  const [menuOpen, setMenuOpen] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionAllowed(!query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  async function toggleVideo() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try { await video.play(); } catch { setVideoFailed(true); }
    } else {
      video.pause();
    }
  }

  const links = [
    { href: "#come-funziona", label: l("Come funziona", "How it works") },
    { href: "/lavoro", label: l("Offerte", "Jobs") },
    { href: "#prezzi", label: l("Prezzi", "Pricing") },
    { href: "/login", label: l("Accedi", "Log in") },
  ];

  return <section className={styles.hero} aria-labelledby="hero-title">
    <Image src={POSTER_URL} alt="" fill priority sizes="100vw" className={styles.poster} />
    {motionAllowed && !videoFailed && <video
      ref={videoRef}
      className={styles.video}
      src={VIDEO_URL}
      poster={POSTER_URL}
      autoPlay loop muted playsInline preload="metadata"
      aria-hidden="true" tabIndex={-1}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onError={() => setVideoFailed(true)}
    />}

    <header className={styles.header} onKeyDown={event => { if (event.key === "Escape") setMenuOpen(false); }}>
      <Link href="/" aria-label="LavorAI home" className={styles.brand}>Lavor<span>AI</span></Link>
      <nav className={styles.desktopNav} aria-label={l("Navigazione principale", "Main navigation")}>
        {links.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className={styles.navActions}>
        <LanguageSwitcher />
        <Link href="/signup" className={`${styles.glass} ${styles.navCta}`} onClick={() => trackEvent(AnalyticsEvent.NAV_SIGNUP)}>{l("Crea account", "Get started")}</Link>
        <button type="button" className={`${styles.glass} ${styles.menuButton}`} aria-label={l(menuOpen ? "Chiudi menu" : "Apri menu", menuOpen ? "Close menu" : "Open menu")} aria-expanded={menuOpen} aria-controls="landing-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
      </div>
      {menuOpen && <nav id="landing-mobile-nav" className={styles.mobileNav} aria-label={l("Navigazione mobile", "Mobile navigation")}>{links.map(link => <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</Link>)}</nav>}
    </header>

    <div className={styles.content}>
      <h1 id="hero-title" className={`${instrumentSerif.className} ${styles.title} ${styles.fadeRise}`}>{l("Tu rilassati.", "Take a breath.")} <span>{l("Le tue candidature, su misura.", "Your applications, tailored.")}</span></h1>
      <p className={`${styles.subtitle} ${styles.fadeRise}`}>{l("LavorAI trova le offerte adatte a te, prepara CV e lettera per ognuna e tiene traccia di ogni passaggio. Tu decidi quando inviare.", "LavorAI finds openings that fit you, prepares a CV and cover letter for each one and tracks every step. You decide when to send.")}</p>
      <div className={`${styles.actions} ${styles.fadeRise}`}>
        <Link href="/signup" className={`${styles.glass} ${styles.primaryCta}`} onClick={() => trackEvent(AnalyticsEvent.HERO_CTA_PRIMARY, { source: "cinematic_hero" })}>{l("Crea account", "Get started")}</Link>
        <Link href="#lead-magnet" className={styles.cvLink} onClick={() => trackEvent(AnalyticsEvent.HERO_CTA_SECONDARY, { source: "cinematic_hero" })}>{l("Prima, prova il tuo CV", "Try your CV first")}<ArrowDown size={14} aria-hidden="true" /></Link>
      </div>
    </div>

    {motionAllowed && !videoFailed && <button type="button" onClick={toggleVideo} className={`${styles.glass} ${styles.videoControl}`} aria-label={playing ? l("Metti in pausa il video", "Pause background video") : l("Riprendi il video", "Play background video")}>
      {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
    </button>}
  </section>;
}
