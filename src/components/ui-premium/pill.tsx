import type { ReactNode } from "react";
import type { Tone } from "./tone";

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  return <span className={`pm-dot tone-${tone}`} aria-hidden />;
}

/** Status pill with a coloured dot. The text carries the meaning; colour only reinforces it. */
export function Pill({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`pm-pill tone-${tone}`} title={title}>
      <span className="pm-dot" aria-hidden />
      {children}
    </span>
  );
}
