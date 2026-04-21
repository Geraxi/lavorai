import { cn } from "@/lib/utils";

type AuroraBackgroundProps = {
  className?: string;
  variant?: "hero" | "subtle";
};

/**
 * Aurora: tre blob gradient animati che driftano sopra lo sfondo.
 * Usa solo CSS keyframes — zero JS, zero layout thrash.
 * `pointer-events-none` per non interferire con il click.
 */
export function AuroraBackground({
  className,
  variant = "hero",
}: AuroraBackgroundProps) {
  const intensity = variant === "hero" ? 1 : 0.5;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {/* Blob 1: accent verde in alto a sinistra */}
      <div
        className="aurora-blob-1 absolute -left-1/4 -top-1/4 h-[700px] w-[700px] rounded-full blur-[120px]"
        style={{
          background: `radial-gradient(circle, hsl(142 71% 37% / ${0.35 * intensity}) 0%, transparent 70%)`,
        }}
      />
      {/* Blob 2: viola/blu a destra per freschezza */}
      <div
        className="aurora-blob-2 absolute -right-1/4 top-0 h-[600px] w-[600px] rounded-full blur-[130px]"
        style={{
          background: `radial-gradient(circle, hsl(217 91% 60% / ${0.18 * intensity}) 0%, transparent 70%)`,
        }}
      />
      {/* Blob 3: accent secondario in basso */}
      <div
        className="aurora-blob-3 absolute bottom-0 left-1/3 h-[500px] w-[500px] rounded-full blur-[140px]"
        style={{
          background: `radial-gradient(circle, hsl(142 71% 45% / ${0.22 * intensity}) 0%, transparent 70%)`,
        }}
      />

      {/* Fade-out in basso per fondere con la sezione successiva */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}
