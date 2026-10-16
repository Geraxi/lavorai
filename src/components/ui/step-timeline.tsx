"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";

import { cn } from "@/lib/utils";

export type TimelineStep = {
  id: string;
  /** Fallback content of the dot when no icon is given. */
  marker?: string;
  title: string;
  body?: string;
  icon?: React.ReactNode;
  href?: string;
};

type StepTimelineProps = {
  steps: TimelineStep[];
  label: string;
  className?: string;
  onStepClick?: (step: TimelineStep, index: number) => void;
};

/**
 * Animated step timeline: vertical on phones, horizontal from md up. A glowing
 * progress line fills as the section scrolls through the viewport and each
 * step lifts in turn. Reduced motion shows the finished state.
 */
export function StepTimeline({ steps, label, className, onStepClick }: StepTimelineProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 55%"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4 });
  const fill = useTransform(smooth, [0, 1], [0, 1]);
  const inset = `${50 / Math.max(steps.length, 1)}%`;
  const edge = { left: inset, right: inset };

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Track + fill (vertical) */}
      <span aria-hidden="true" className="absolute bottom-7 left-[28px] top-7 w-px bg-white/15 md:hidden" />
      <motion.span
        aria-hidden="true"
        style={reduced ? undefined : { scaleY: fill }}
        className="absolute bottom-7 left-[28px] top-7 w-px origin-top bg-gradient-to-b from-[#00efa0] to-[#5fd4ff] shadow-[0_0_12px_rgba(0,239,160,.8)] md:hidden"
      />
      {/* Track + fill (horizontal) */}
      <span aria-hidden="true" style={edge} className="absolute top-[32px] hidden h-px bg-white/15 md:block" />
      <motion.span
        aria-hidden="true"
        style={reduced ? edge : { ...edge, scaleX: fill }}
        className="absolute top-[32px] hidden h-px origin-left bg-gradient-to-r from-[#00efa0] to-[#5fd4ff] shadow-[0_0_12px_rgba(0,239,160,.8)] md:block"
      />
      <ol aria-label={label} className="relative grid list-none gap-5 p-0 md:grid-flow-col md:auto-cols-fr md:gap-4">
      {steps.map((step, index) => {
        const inner = (
          <>
            <span className="relative z-[1] grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#00efa0]/45 bg-[#06324a] text-[#c9fbe9] shadow-[0_0_0_6px_rgba(0,43,66,.9),0_0_24px_rgba(0,239,160,.25)] md:mx-auto">
              {step.icon ?? <span className="text-xs font-semibold tabular-nums">{step.marker}</span>}
            </span>
            <span className="min-w-0 md:mt-5 md:block md:text-center">
              <span className="block text-[17px] font-medium leading-snug text-white">{step.title}</span>
              {step.body && <span className="mt-1.5 block text-[13px] leading-relaxed text-[#bcd0dc]">{step.body}</span>}
            </span>
          </>
        );
        const itemClass = "group/step flex items-start gap-4 rounded-2xl p-1 text-left md:flex-col md:items-stretch md:gap-0 md:p-2";
        return (
          <motion.li
            key={step.id}
            initial={reduced ? false : { opacity: 0, y: 22 }}
            whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1], delay: index * 0.07 }}
            className="relative"
          >
            {step.href ? (
              <a href={step.href} onClick={() => onStepClick?.(step, index)} className={cn(itemClass, "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white")}>
                {inner}
              </a>
            ) : (
              <div className={itemClass}>{inner}</div>
            )}
          </motion.li>
        );
      })}
      </ol>
    </div>
  );
}
