import { cn } from "@/lib/utils";

const platforms = ["LinkedIn", "InfoJobs", "Subito", "Indeed", "Monster"];

type TrustRowProps = {
  label?: string;
  className?: string;
};

export function TrustRow({
  label = "Ottimizza per i portali che usi ogni giorno",
  className,
}: TrustRowProps) {
  return (
    <div className={cn("w-full", className)}>
      <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground/70">
        {label}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 md:gap-x-14">
        {platforms.map((p) => (
          <span
            key={p}
            className="text-lg font-semibold tracking-tight text-muted-foreground/80 transition-colors hover:text-foreground md:text-xl"
          >
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}
