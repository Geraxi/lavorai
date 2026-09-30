"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
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
  const { scrollYProgress } = useScroll();

  const smooth = useSpring(scrollYProgress, { stiffness: 65, damping: 24, mass: 0.35 });
  const planetX = useTransform(smooth, [0, 0.18, 0.48, 0.78, 1], ["28vw", "14vw", "-18vw", "10vw", "26vw"]);
  const planetY = useTransform(smooth, [0, 0.18, 0.48, 0.78, 1], ["2vh", "22vh", "10vh", "18vh", "30vh"]);
  const planetScale = useTransform(smooth, [0, 0.18, 0.48, 0.78, 1], [0.88, 0.76, 0.64, 0.76, 0.6]);
  const planetRotate = useTransform(smooth, [0, 1], [-7, 18]);
  const planetOpacity = useTransform(smooth, [0, 0.1, 0.24, 0.9, 1], [0.98, 0.86, 0.7, 0.58, 0.42]);
  const orbitRotate = useTransform(smooth, [0, 1], [-12, 120]);

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
        <motion.div
          className={styles.orbit}
          style={reducedMotion ? undefined : { rotate: orbitRotate }}
        >
          <span className={styles.orbitMarker} />
          <span className={styles.orbitMarkerSoft} />
        </motion.div>
        <motion.div
          className={styles.planet}
          style={reducedMotion ? undefined : { x: planetX, y: planetY, scale: planetScale, rotate: planetRotate, opacity: planetOpacity }}
        />
        <div className={styles.haze} />
      </div>
      <div ref={flowRef} className={styles.flow}>{children}</div>
    </div>
  );
}
