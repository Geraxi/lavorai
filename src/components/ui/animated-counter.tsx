"use client";

import * as React from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

type AnimatedCounterProps = {
  /** The real value. It is rendered as-is on the server and without JS. */
  children: number;
  className?: string;
  /** Seconds. */
  duration?: number;
  format?: (value: number) => string;
};

/**
 * Counts up to its value the first time it scrolls into view. The final number
 * is always in the markup (SSR, no-JS, screen readers) and the element keeps
 * tabular figures, so the animation never shifts layout. Reduced motion shows
 * the value immediately.
 */
export function AnimatedCounter({ children: value, className, duration = 1.1, format = (v) => String(v) }: AnimatedCounterProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const formatRef = React.useRef(format);
  formatRef.current = format;

  React.useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return;
    if (reduced || value === 0 || !Number.isFinite(value)) { node.textContent = formatRef.current(value); return; }
    const controls = animate(0, value, {
      duration,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (latest) => { node.textContent = formatRef.current(Math.round(latest)); },
    });
    return () => controls.stop();
  }, [inView, reduced, value, duration]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(value)}
    </span>
  );
}
