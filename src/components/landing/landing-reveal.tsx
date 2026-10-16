"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

/**
 * Landing-only scroll reveal. Animates transform and opacity only (no blur),
 * When the user prefers reduced motion the content is shown at once, without
 * travel (the server render cannot know the preference, so it must be revealed
 * explicitly on the client rather than left in its hidden starting state).
 */
export function Reveal({ children, delay = 0, y = 24, className }: {
  children: ReactNode; delay?: number; y?: number; className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const variants: Variants = {
    hidden: { opacity: 0, y },
    visible: { opacity: 1, y: 0, transition: reducedMotion ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay } },
  };
  return <motion.div
    initial="hidden"
    animate={reducedMotion ? "visible" : undefined}
    whileInView={reducedMotion ? undefined : "visible"}
    viewport={{ once: true, amount: 0.2 }}
    variants={variants}
    className={className}
  >{children}</motion.div>;
}
