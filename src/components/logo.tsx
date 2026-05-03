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

const ACCENT = "#34D399"; // emerald — accento brand

function Mark({ size }: { size: number }) {
  // 4 blocchi separati che formano una L stilizzata:
  //   1. Top: piccolo rettangolo (bianco/foreground)
  //   2. Verde: blocco accento brand
  //   3. White: piccolo rettangolo bianco sotto il verde
  //   4. Base: lunga barra orizzontale (bianco) che esce a destra
  // Gap visibili tra ogni blocco.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="3" y="2" width="6" height="3" rx="0.4" fill="currentColor" />
      <rect x="3" y="6" width="6" height="4" rx="0.4" fill={ACCENT} />
      <rect x="3" y="11" width="6" height="3" rx="0.4" fill="currentColor" />
      <rect x="3" y="18" width="18" height="4" rx="0.4" fill="currentColor" />
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
