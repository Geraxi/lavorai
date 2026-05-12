import { cn } from "@/lib/utils";

export type ApplicationStatus =
  | "pronta"
  | "inviata"
  | "vista"
  | "colloquio"
  | "offerta"
  | "rifiutata"
  | "queued"
  | "optimizing"
  | "ready_to_apply"
  | "applying"
  | "success"
  | "failed"
  | "needs_2fa"
  | "needs_session";

const MAP: Record<ApplicationStatus, { label: string; className: string }> = {
  // Stati business (design)
  pronta: { label: "CV pronto", className: "ds-chip ds-chip-blue" },
  // "inviata" è semanticamente equivalente a "success" — entrambi
  // rappresentano una candidatura consegnata. Usa lo stesso chip verde
  // per coerenza visiva (signal positivo forte).
  inviata: { label: "Inviata", className: "ds-chip ds-chip-green" },
  vista: { label: "Vista", className: "ds-chip ds-chip-blue" },
  colloquio: { label: "Colloquio", className: "ds-chip ds-chip-amber" },
  offerta: { label: "Offerta", className: "ds-chip ds-chip-green" },
  rifiutata: { label: "Rifiutata", className: "ds-chip ds-chip-red" },
  // Stati pipeline backend mappati per UX
  queued: { label: "In coda", className: "ds-chip" },
  optimizing: { label: "Ottimizzo...", className: "ds-chip ds-chip-amber" },
  ready_to_apply: { label: "CV pronto", className: "ds-chip ds-chip-blue" },
  applying: { label: "Invio...", className: "ds-chip ds-chip-amber" },
  success: { label: "Inviata", className: "ds-chip ds-chip-green" },
  failed: { label: "Errore", className: "ds-chip ds-chip-red" },
  needs_2fa: { label: "2FA", className: "ds-chip ds-chip-amber" },
  needs_session: { label: "Ri-login", className: "ds-chip ds-chip-amber" },
};

export function StatusChip({ status }: { status: ApplicationStatus | string }) {
  const def = (MAP as Record<string, (typeof MAP)[ApplicationStatus]>)[status] ?? MAP.inviata;
  return <span className={cn(def.className)}>{def.label}</span>;
}
