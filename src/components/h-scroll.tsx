"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Barra orizzontale scorrevole con il dito (tab, filtri, nav di sezione).
 *
 * Su iPhone le barre di pill andavano fuori dalla card (che su mobile ha
 * overflow-x:hidden) senza un contenitore scorrevole proprio: si vedevano
 * tagliate e non si potevano trascinare. Qui la barra È lo scroller:
 * overflow-x:auto, figli che non si restringono, scrollbar nascosta,
 * sfumatura ai bordi quando c'è altro contenuto e voce attiva portata in
 * vista al primo render. Stili in globals.css (`.lv-hscroll`).
 */
export function HScroll({
  children,
  className = "",
  style,
  ariaLabel,
  role,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  role?: string;
  as?: "div" | "nav";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const lastActive = useRef<string | null>(null);

  // Sfumature: aggiornate su scroll e resize.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.dataset.fadeStart = el.scrollLeft > 2 ? "1" : "0";
      el.dataset.fadeEnd = max - el.scrollLeft > 2 ? "1" : "0";
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);

  // Porta in vista la voce attiva solo quando CAMBIA (non a ogni refresh
  // della pagina, che altrimenti riporterebbe indietro lo scroll dell'utente).
  // scrollLeft diretto: niente salti dello scroll verticale.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(
      '[aria-current]:not([aria-current="false"]), [aria-selected="true"], [data-active="true"]',
    );
    const key = active ? (active.getAttribute("href") ?? active.textContent ?? "") : null;
    if (key === lastActive.current) return;
    lastActive.current = key;
    if (active && el.scrollWidth > el.clientWidth) {
      const ar = active.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const target = el.scrollLeft + (ar.left - er.left) - (el.clientWidth - ar.width) / 2;
      el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
    }
    el.dispatchEvent(new Event("scroll"));
  });

  const Tag = as;
  return (
    <Tag
      ref={ref as never}
      className={`lv-hscroll ${className}`.trim()}
      style={style}
      aria-label={ariaLabel}
      role={role}
    >
      {children}
    </Tag>
  );
}
