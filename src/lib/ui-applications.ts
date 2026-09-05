import { prisma, getDemoUser } from "@/lib/db";
import { companyColor } from "@/components/design/company-logo";

/**
 * Shape utilizzato dal layer UI.
 * Solo dati reali dal DB — niente padding/mock.
 */
export interface UIApplication {
  id: string;
  company: string;
  color: string;
  role: string;
  location: string;
  mode: string;
  salary: string;
  applied: string;
  status: "pronta" | "inviata" | "vista" | "colloquio" | "offerta" | "rifiutata";
  match: number;
  source: string;
  stage: number;
  isReal: boolean;
}

/**
 * Ritorna le applications reali dell'utente per il rendering UI.
 * Mostra TUTTE le candidature (success, ready_to_apply, awaiting_consent,
 * failed) così l'utente vede cosa sta succedendo invece di una dashboard vuota.
 */
export async function getUIApplications(
  userId?: string,
): Promise<UIApplication[]> {
  const uid = userId ?? (await getDemoUser()).id;
  // Mostra: candidature consegnate (success) + quelle in attesa di azione
  // utente (ready_to_apply, awaiting_consent, needs_answers) + fallimenti
  // recenti (failed < 48h). Escludi solo quelle in elaborazione transiente
  // (queued, optimizing, applying) — quelle vengono mostrate via live polling.
  const rows = await prisma.application.findMany({
    where: {
      userId: uid,
      OR: [
        { status: "success" },
        { status: "ready_to_apply" },
        { status: "awaiting_consent" },
        { status: "needs_answers" },
        {
          status: "failed",
          createdAt: { gte: new Date(Date.now() - 48 * 3600_000) },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { job: true },
  });

  return rows.map((row) => {
    // viewedAt > userStatus override > backend status. Se il recruiter ha
    // aperto la mail (pixel Resend o webhook), upgrade da "inviata" a "vista".
    const userOverride = row.userStatus as UIApplication["status"] | null;
    const baseStatus = row.viewedAt ? "vista" : mapStatus(row.status);
    return {
      id: row.id,
      company: row.job.company ?? "—",
      color: companyColor(row.job.company ?? row.job.title),
      role: row.job.title,
      location: row.job.location ?? "—",
      mode: row.job.remote ? "Remoto" : "Ibrido",
      salary: formatSalary(row.job.salaryMin, row.job.salaryMax),
      applied: relativeTime(row.createdAt),
      status: userOverride ?? baseStatus,
      match: row.atsScore ?? 80,
      source: capitalize(row.job.source),
      stage: stageFromStatus(row.status),
      isReal: true,
    };
  });
}

function mapStatus(backend: string): UIApplication["status"] {
  switch (backend) {
    case "success":
      return "inviata";
    case "failed":
      return "rifiutata";
    case "ready_to_apply":
      return "pronta";
    case "awaiting_consent":
      return "pronta"; // User needs to approve
    case "needs_answers":
      return "pronta"; // User needs to answer questions
    case "queued":
    case "optimizing":
    case "applying":
      return "pronta"; // In progress, will update soon
    case "needs_2fa":
    case "needs_session":
      return "pronta";
    default:
      return "pronta";
  }
}

function stageFromStatus(backend: string): number {
  switch (backend) {
    case "success":
      return 1;
    case "failed":
      return 0;
    default:
      return 1;
  }
}

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return "—";
  const fmt = (n: number) => `€${Math.round(n / 1000)}k`;
  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (min) return `da ${fmt(min)}`;
  if (max) return `fino a ${fmt(max)}`;
  return "—";
}

function relativeTime(d: Date): string {
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ${diffH === 1 ? "ora" : "ore"} fa`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Ieri";
  return `${diffD} giorni fa`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Suggerimenti ruoli/città per onboarding quando l'AI non ha estratto
 * nulla dal CV. Sono solo CHIP cliccabili come spunto: NESSUNO è
 * pre-selezionato. Salviamo esclusivamente ciò che l'utente sceglie
 * attivamente — niente bias "Product Designer di default a tutti".
 */
export const ROLE_PREFERENCES = [
  { title: "Product Designer", selected: false },
  { title: "UX Designer", selected: false },
  { title: "UI Designer", selected: false },
  { title: "Product Manager", selected: false },
  { title: "Frontend Developer", selected: false },
  { title: "Backend Developer", selected: false },
];

export const LOCATION_PREFS = [
  { city: "Milano", selected: false },
  { city: "Roma", selected: false },
  { city: "Torino", selected: false },
  { city: "Bologna", selected: false },
  { city: "Remoto (IT)", selected: false },
  { city: "Remoto (EU)", selected: false },
];

export const PIPELINE = ["Applicata", "Vista", "Screening", "Colloquio", "Offerta"];
