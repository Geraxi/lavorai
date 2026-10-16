"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion, type PanInfo } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Card Fan Carousel, after the 21st.dev community component by aayush-duhan:
 * cards fan out on an arc with an elastic entrance, spread further on hover
 * and page one card at a time with circular controls.
 *
 * Accessibility: the region is a labelled carousel; only the active slide is
 * exposed to assistive tech, the controls are real buttons, arrow keys page
 * when the region has focus and a polite live region announces the change.
 * prefers-reduced-motion removes the entrance, springs and drag.
 */
export type CardFanItem = {
  id: string;
  /** Short accessible name, e.g. "CV su misura". */
  label: string;
  content: React.ReactNode;
};

type CardFanCarouselProps = {
  items: CardFanItem[];
  /** Accessible name of the carousel region. */
  label: string;
  previousLabel?: string;
  nextLabel?: string;
  /** Builds the slide position text, e.g. (1, 5) => "1 di 5". */
  positionLabel?: (index: number, total: number) => string;
  /** Builds the label of a pagination dot. */
  goToLabel?: (item: CardFanItem, index: number) => string;
  initialIndex?: number;
  className?: string;
  cardClassName?: string;
  onIndexChange?: (index: number) => void;
};

/* Paging and hover spread: Apple-style spring, interruptible mid-flight. */
const PAGE_SPRING = { type: "spring", duration: 0.5, bounce: 0.2 } as const;
/* The one elastic moment: the fan opening the first time it is seen. */
const ENTRANCE_SPRING = { type: "spring", duration: 0.8, bounce: 0.3 } as const;

function useCompact(ref: React.RefObject<HTMLElement | null>) {
  const [compact, setCompact] = React.useState(false);
  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 640));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return compact;
}

export function CardFanCarousel({
  items,
  label,
  previousLabel = "Precedente",
  nextLabel = "Successiva",
  positionLabel = (index, total) => `${index + 1} di ${total}`,
  goToLabel = (item) => item.label,
  initialIndex = 0,
  className,
  cardClassName,
  onIndexChange,
}: CardFanCarouselProps) {
  const total = items.length;
  const [active, setActive] = React.useState(() => Math.min(Math.max(initialIndex, 0), Math.max(total - 1, 0)));
  const [hovered, setHovered] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.35 });
  const reduced = useReducedMotion() ?? false;
  const compact = useCompact(rootRef);
  const regionId = React.useId();

  const go = React.useCallback((next: number) => {
    if (total === 0) return;
    const index = ((next % total) + total) % total;
    setActive(index);
    onIndexChange?.(index);
  }, [onIndexChange, total]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") { event.preventDefault(); go(active + 1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); go(active - 1); }
    else if (event.key === "Home") { event.preventDefault(); go(0); }
    else if (event.key === "End") { event.preventDefault(); go(total - 1); }
  }

  // A flick is enough: page on distance or on velocity (~0.11px/ms), whichever comes first.
  function onDragEnd(_: unknown, info: PanInfo) {
    const { x: distance } = info.offset;
    const { x: velocity } = info.velocity;
    if (distance < -60 || velocity < -110) go(active + 1);
    else if (distance > 60 || velocity > 110) go(active - 1);
  }
  const [hasEntered, setHasEntered] = React.useState(false);
  React.useEffect(() => {
    if (!inView || hasEntered) return;
    const timer = window.setTimeout(() => setHasEntered(true), 900);
    return () => window.clearTimeout(timer);
  }, [inView, hasEntered]);

  const maxVisible = compact ? 1 : 2;
  const spread = (hovered && !compact ? 1.32 : 1) * (compact ? 0.62 : 1);
  const entered = inView || reduced;

  return (
    <div className={cn("relative w-full overflow-x-clip py-2", className)}>
      <div
        ref={rootRef}
        id={regionId}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        className="relative mx-auto h-[400px] w-full max-w-[880px] touch-pan-y select-none rounded-[28px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00efa0]/80 sm:h-[480px]"
      >
        {items.map((item, index) => {
          let offset = index - active;
          if (offset > total / 2) offset -= total;
          if (offset < -total / 2) offset += total;
          const distance = Math.abs(offset);
          const isActive = offset === 0;
          const visible = distance <= maxVisible;
          const target = {
            x: offset * 150 * spread,
            y: distance * distance * 14 * (compact ? 0.7 : 1),
            rotate: offset * 9 * spread,
            scale: 1 - distance * 0.07,
            opacity: visible ? (distance <= 1 ? 1 : 0.85) : 0,
          };
          const stacked = { x: 0, y: 90, rotate: 0, scale: 0.86, opacity: 0 };
          return (
            <motion.div
              key={item.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${positionLabel(index, total)}: ${item.label}`}
              aria-hidden={!isActive}
              inert={!isActive}
              initial={reduced ? false : stacked}
              animate={entered ? target : stacked}
              transition={reduced ? { duration: 0 } : hasEntered ? PAGE_SPRING : { ...ENTRANCE_SPRING, delay: Math.min(distance, 3) * 0.06 }}
              drag={isActive && !reduced ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.35}
              onDragEnd={isActive ? onDragEnd : undefined}
              onClick={() => { if (!isActive) go(index); }}
              style={{ zIndex: 50 - distance, transformOrigin: "50% 120%", pointerEvents: visible ? "auto" : "none" }}
              className={cn(
                "absolute left-1/2 top-4 -ml-[125px] w-[250px] sm:top-6 sm:-ml-[150px] sm:w-[300px]",
                isActive ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                cardClassName,
              )}
            >
              <div
                className={cn(
                  "relative overflow-hidden rounded-[22px]",
                  isActive
                    ? "shadow-[0_30px_80px_-20px_rgba(0,239,160,.35),0_24px_50px_rgba(0,10,20,.45)]"
                    : "shadow-[0_18px_40px_rgba(0,10,20,.4)]",
                )}
              >
                {item.content}
                {!isActive && <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#021c2b]/40" />}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={() => go(active - 1)}
          aria-controls={regionId}
          aria-label={previousLabel}
          className="grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-white/[.04] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur transition-[transform,background-color,border-color] duration-150 ease-out hover:border-[#00efa0]/60 hover:bg-white/10 active:scale-[.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none"
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <div className="flex items-center sm:gap-1">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(index)}
              aria-controls={regionId}
              aria-current={index === active ? "true" : undefined}
              aria-label={goToLabel(item, index)}
              className="group grid h-10 w-7 place-items-center rounded-full sm:w-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block h-2.5 w-2.5 rounded-full transition-[transform,background-color] duration-200 [transition-timing-function:cubic-bezier(.23,1,.32,1)] motion-reduce:transition-none",
                  index === active ? "scale-125 bg-[#00efa0]" : "bg-white/35 group-hover:bg-white/70",
                )}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(active + 1)}
          aria-controls={regionId}
          aria-label={nextLabel}
          className="grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-white/[.04] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur transition-[transform,background-color,border-color] duration-150 ease-out hover:border-[#00efa0]/60 hover:bg-white/10 active:scale-[.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none"
        >
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {total > 0 ? `${positionLabel(active, total)}: ${items[active].label}` : ""}
      </p>
    </div>
  );
}
