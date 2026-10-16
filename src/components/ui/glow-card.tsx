"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Glow Features grid: every card shares one pointer listener on the grid,
 * which writes the cursor position into CSS custom properties. The glow and
 * the lit border are pure CSS (no React re-render per frame), stay off on
 * touch input and never move layout.
 */
export function GlowGrid({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const frame = React.useRef(0);

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      ref.current?.querySelectorAll<HTMLElement>("[data-glow-card]").forEach((card) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--glow-x", `${clientX - rect.left}px`);
        card.style.setProperty("--glow-y", `${clientY - rect.top}px`);
      });
    });
  }

  React.useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div ref={ref} onPointerMove={onPointerMove} className={cn("group/glow", className)} {...props}>
      {children}
    </div>
  );
}

type GlowCardProps = React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "li";
  /** Accent of the glow, any CSS colour. */
  glow?: string;
};

export function GlowCard({ as: Tag = "div", glow = "0 239 160", className, children, style, ...props }: GlowCardProps) {
  return (
    <Tag
      data-glow-card=""
      style={{ ["--glow-rgb" as string]: glow, ...style }}
      className={cn(
        "relative isolate overflow-hidden rounded-[24px] border border-white/[.14] bg-[linear-gradient(150deg,rgba(255,255,255,.09),rgba(255,255,255,.015)_55%),rgba(9,44,62,.72)] shadow-[0_28px_64px_rgba(0,9,18,.28),inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur-xl",
        // Soft light that follows the cursor across the whole grid.
        "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:opacity-0 before:transition-opacity before:duration-300 before:ease-out before:content-[''] before:[background:radial-gradient(520px_circle_at_var(--glow-x,50%)_var(--glow-y,0%),rgb(var(--glow-rgb)/.13),transparent_42%)] group-hover/glow:before:opacity-100",
        // Lit border: same gradient, masked to a 1px ring.
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:p-px after:opacity-0 after:transition-opacity after:duration-300 after:ease-out after:content-[''] after:[background:radial-gradient(380px_circle_at_var(--glow-x,50%)_var(--glow-y,0%),rgb(var(--glow-rgb)/.7),transparent_45%)] after:[mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)] group-hover/glow:after:opacity-100",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
