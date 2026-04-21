"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useTransform, animate } from "motion/react";
import { Spark } from "@/components/design/spark";
import { cn } from "@/lib/utils";

export function Kpi({
  label,
  value,
  delta,
  up,
  mono,
  sparkData,
  sparkColor,
  index = 0,
}: {
  label: string;
  value: string;
  delta?: string;
  up?: boolean;
  mono?: boolean;
  sparkData?: number[];
  sparkColor?: string;
  index?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <motion.div
      ref={ref}
      className="ds-kpi ds-kpi-premium"
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: 0.55,
        ease: [0.22, 1, 0.36, 1],
        delay: index * 0.08,
      }}
      whileHover={{ y: -2 }}
    >
      <div className="ds-kpi-label">{label}</div>
      <div className={cn("ds-kpi-value", mono && "mono")}>
        <AnimatedValue value={value} play={inView} />
      </div>
      {delta && (
        <div className={cn("ds-kpi-delta", up ? "up" : "down")}>{delta}</div>
      )}
      {sparkData && (
        <div className="ds-kpi-spark">
          <Spark data={sparkData} color={sparkColor ?? "var(--fg)"} />
        </div>
      )}
    </motion.div>
  );
}

/**
 * Parses a value like "142", "62%", "38h", "€1.140" and animates the numeric
 * portion from 0 → target, preserving any prefix/suffix.
 */
function AnimatedValue({ value, play }: { value: string; play: boolean }) {
  const match = value.match(/^(\D*)([\d.,]+)(.*)$/);
  if (!match) return <>{value}</>;
  const [, prefix, num, suffix] = match;
  const target = parseFloat(num.replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(target)) return <>{value}</>;

  return (
    <>
      {prefix}
      <Counter to={target} play={play} decimals={num.includes(",") ? 1 : 0} />
      {suffix}
    </>
  );
}

function Counter({
  to,
  play,
  decimals,
}: {
  to: number;
  play: boolean;
  decimals: number;
}) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) =>
    decimals > 0
      ? v.toFixed(decimals).replace(".", ",")
      : Math.round(v).toLocaleString("it-IT"),
  );
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!play) return;
    const controls = animate(mv, to, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [play, to, mv, rounded]);

  return <>{display}</>;
}
