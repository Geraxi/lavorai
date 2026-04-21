import Link from "next/link";
import { MapPin, Clock, Wallet, Wifi } from "lucide-react";
import type { Job } from "@prisma/client";
import { formatRelativeDate, formatSalary } from "@/lib/jobs-repo";
import { cn } from "@/lib/utils";

export function JobCard({
  job,
  className,
}: {
  job: Job;
  className?: string;
}) {
  const salary = formatSalary(job.salaryMin, job.salaryMax);
  const posted = formatRelativeDate(job.postedAt);

  return (
    <Link
      href={`/jobs/${job.id}`}
      className={cn(
        "card-hover-glow group relative block overflow-hidden rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur transition-all",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight text-foreground">
            {job.title}
          </h3>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {job.company ?? "—"}
          </div>
        </div>
        {job.remote && (
          <span className="flex flex-none items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary ring-1 ring-primary/20">
            <Wifi className="h-3 w-3" />
            Remoto
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {job.location && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> {job.location}
          </span>
        )}
        {job.contractType && (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> {formatContract(job.contractType)}
          </span>
        )}
        {salary && (
          <span className="inline-flex items-center gap-1.5 text-foreground/80">
            <Wallet className="h-3.5 w-3.5" /> {salary}
          </span>
        )}
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
        {job.description}
      </p>

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-muted-foreground/70">{posted}</span>
        <span className="font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Applica con LavorAI →
        </span>
      </div>
    </Link>
  );
}

function formatContract(contractType: string): string {
  const map: Record<string, string> = {
    permanent: "Indeterminato",
    contract: "Contratto",
    full_time: "Full-time",
    part_time: "Part-time",
  };
  return map[contractType] ?? contractType;
}
