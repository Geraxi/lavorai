import Link from "next/link";
import { cn } from "@/lib/utils";

type LogoProps = {
  href?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

/**
 * LavorAI brand mark.
 *
 * - L-glyph costruito da 3 rettangoli (bar verticale + base avorio +
 *   accento oro/bronzo) — sostituisce la prima "L" della parola.
 * - Wordmark "avorAI" dove "AI" è in oro/bronzo (accent brand).
 */
const sizes = {
  sm: { mark: 18, text: "text-base", gap: 6 },
  md: { mark: 22, text: "text-xl", gap: 8 },
  lg: { mark: 30, text: "text-3xl", gap: 10 },
};

const ACCENT = "#C49A5C"; // bronzo / oro caldo

function Mark({ size }: { size: number }) {
  // Tre rettangoli stacked che formano una L:
  //   1. Top: barra verticale (bianco/foreground)
  //   2. Middle: piccolo blocco bronzo (accento)
  //   3. Bottom: base orizzontale che si estende a destra (bianco)
  // Nessun overlap, leggera spaziatura tra i blocchi.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* 1. vertical top */}
      <rect x="4" y="3" width="6" height="9" rx="0.5" fill="currentColor" />
      {/* 2. bronze accent */}
      <rect x="4" y="13" width="6" height="4" rx="0.5" fill={ACCENT} />
      {/* 3. horizontal base */}
      <rect x="4" y="18" width="16" height="3.5" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export function Logo({ href = "/", className, size = "md" }: LogoProps) {
  const cfg = sizes[size];
  const content = (
    <span
      className={cn("inline-flex items-center text-foreground", className)}
      style={{ gap: cfg.gap, lineHeight: 1 }}
    >
      <Mark size={cfg.mark} />
      <span
        className={cn("font-bold tracking-tight", cfg.text)}
        style={{ letterSpacing: "-0.02em" }}
      >
        avor<span style={{ color: ACCENT }}>AI</span>
      </span>
    </span>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      aria-label="LavorAI — home"
      className="inline-flex items-center"
    >
      {content}
    </Link>
  );
}
