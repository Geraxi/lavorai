"use client";

import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import styles from "./marketing-atmosphere.module.css";

/**
 * Movimento condiviso dalla landing: non una seconda hero, ma una scena
 * continua che accompagna le sezioni e lascia il pianeta LavorAI al centro
 * della narrazione. Tutto resta decorativo e non intercetta mai lo scroll.
 */
export function MarketingMotionShell({ children }: { children: ReactNode }) {
  const flowRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const flow = flowRef.current;
    if (!flow || reducedMotion) return;
    const sections = Array.from(flow.querySelectorAll<HTMLElement>(":scope > section"));
    sections.forEach((section) => section.classList.add(styles.section));
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add(styles.visible)),
      { threshold: 0.12, rootMargin: "0px 0px -7% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <div className={styles.shell}>
      <div className={styles.atmosphere} aria-hidden>
        <div className={styles.stars} />
        <div className={styles.haze} />
      </div>
      <div ref={flowRef} className={styles.flow}>{children}</div>
    </div>
  );
}
