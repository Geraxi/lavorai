import { prisma, getDemoUser } from "@/lib/db";
import { companyColor } from "@/components/design/company-logo";

/**
 * Shape utilizzato dal layer UI (design LavorAI.html).
 * Merge tra Application reali dal DB + mock data dal design quando
 * servono righe in più per dimostrare l'UI.
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

// Dataset mock dal design LavorAI.html (data.jsx) — demo first experience
const MOCK_APPS: Omit<UIApplication, "id" | "isReal">[] = [
  { company: "Satispay", color: "#EF3E42", role: "Product Designer", location: "Milano", mode: "Ibrido", salary: "€45k–55k", applied: "2 ore fa", status: "inviata", match: 94, source: "LinkedIn", stage: 1 },
  { company: "Scalapay", color: "#FE5FA3", role: "Senior UX Designer", location: "Milano", mode: "Remoto", salary: "€55k–68k", applied: "4 ore fa", status: "vista", match: 91, source: "Indeed", stage: 2 },
  { company: "Nexi", color: "#1B3C89", role: "Product Designer — Pagamenti", location: "Roma", mode: "Ibrido", salary: "€48k–60k", applied: "5 ore fa", status: "colloquio", match: 88, source: "LinkedIn", stage: 3 },
  { company: "Bending Spoons", color: "#0A0A0A", role: "Senior Product Designer", location: "Milano", mode: "In sede", salary: "€70k–90k", applied: "Ieri", status: "inviata", match: 86, source: "Sito azienda", stage: 1 },
  { company: "Docebo", color: "#7E3FF2", role: "UX Designer", location: "Biassono", mode: "Ibrido", salary: "€42k–52k", applied: "Ieri", status: "rifiutata", match: 78, source: "LinkedIn", stage: 0 },
  { company: "Casavo", color: "#1F6BFF", role: "Product Designer II", location: "Milano", mode: "Remoto", salary: "€50k–62k", applied: "Ieri", status: "vista", match: 89, source: "Welcome to the Jungle", stage: 2 },
  { company: "Lastminute", color: "#F7235C", role: "Senior UI/UX Designer", location: "Chiasso/Milano", mode: "Ibrido", salary: "€48k–58k", applied: "2 giorni fa", status: "colloquio", match: 82, source: "LinkedIn", stage: 3 },
  { company: "Brumbrum", color: "#FFB400", role: "Product Designer", location: "Milano", mode: "Ibrido", salary: "€44k–54k", applied: "2 giorni fa", status: "inviata", match: 84, source: "Indeed", stage: 1 },
  { company: "Everli", color: "#FF2954", role: "Lead Product Designer", location: "Milano", mode: "Remoto", salary: "€75k–95k", applied: "2 giorni fa", status: "offerta", match: 96, source: "Referral", stage: 4 },
  { company: "Subito", color: "#DD0000", role: "Senior UX Designer", location: "Milano", mode: "Ibrido", salary: "€52k–65k", applied: "3 giorni fa", status: "vista", match: 87, source: "Welcome to the Jungle", stage: 2 },
  { company: "Treatwell", color: "#FF3A9E", role: "Product Designer", location: "Milano", mode: "Remoto", salary: "€46k–58k", applied: "3 giorni fa", status: "rifiutata", match: 74, source: "LinkedIn", stage: 0 },
  { company: "MoneyFarm", color: "#0E4C92", role: "Senior Product Designer", location: "Milano/Londra", mode: "Ibrido", salary: "€60k–75k", applied: "4 giorni fa", status: "colloquio", match: 90, source: "Referral", stage: 3 },
  { company: "Musement", color: "#FF5A00", role: "UX Designer", location: "Milano", mode: "Ibrido", salary: "€40k–50k", applied: "4 giorni fa", status: "inviata", match: 81, source: "LinkedIn", stage: 1 },
  { company: "Young Platform", color: "#00D084", role: "Product Designer", location: "Torino", mode: "Ibrido", salary: "€45k–55k", applied: "5 giorni fa", status: "vista", match: 85, source: "AngelList", stage: 2 },
  { company: "Glickon", color: "#5D2EFA", role: "Senior UX/UI Designer", location: "Milano", mode: "Remoto", salary: "€48k–58k", applied: "5 giorni fa", status: "inviata", match: 83, source: "LinkedIn", stage: 1 },
];

/**
 * Ritorna le applications pronte per il rendering UI.
 * - Prima i record reali dal DB (con status mappato e colore derivato)
 * - Poi completa con mock finché si raggiunge il totale richiesto
 */
export async function getUIApplications(
  userId?: string,
): Promise<UIApplication[]> {
  // Se non passiamo userId, fallback al demo user (mantiene vecchio comportamento
  // solo per codice legacy). Il dashboard passa sempre l'userId reale.
  const uid = userId ?? (await getDemoUser()).id;
  const rows = await prisma.application.findMany({
    where: { userId: uid },
    orderBy: { createdAt: "desc" },
    include: { job: true },
  });

  const real: UIApplication[] = rows.map((row) => ({
    id: row.id,
    company: row.job.company ?? "—",
    color: companyColor(row.job.company ?? row.job.title),
    role: row.job.title,
    location: row.job.location ?? "—",
    mode: row.job.remote ? "Remoto" : "Ibrido",
    salary: formatSalary(row.job.salaryMin, row.job.salaryMax),
    applied: relativeTime(row.createdAt),
    status: mapStatus(row.status),
    match: row.atsScore ?? 80,
    source: capitalize(row.job.source),
    stage: stageFromStatus(row.status),
    isReal: true,
  }));

  // Mai padding con mock data: gli utenti nuovi devono vedere una dashboard vuota.
  return real;
}

function mapStatus(backend: string): UIApplication["status"] {
  switch (backend) {
    case "success":
      return "inviata";
    case "failed":
      return "rifiutata";
    case "ready_to_apply":
      return "pronta";
    case "queued":
    case "optimizing":
    case "applying":
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

// Daily applications for the 30-day chart (mock by design)
export const DAILY_APPLICATIONS_30D = [
  4, 6, 5, 7, 8, 3, 2, 9, 11, 8, 7, 10, 12, 6, 4,
  9, 14, 11, 13, 15, 8, 5, 12, 16, 14, 18, 17, 12, 19, 22,
];

export const FUNNEL_DATA = [
  { label: "Candidature inviate", value: 142, pct: 100 },
  { label: "Viste dal recruiter", value: 88, pct: 62 },
  { label: "Risposte ricevute", value: 34, pct: 24 },
  { label: "Colloqui programmati", value: 11, pct: 8 },
  { label: "Offerte", value: 3, pct: 2.1 },
];

// Coordinate % sul viewBox 100x120 della silhouette Italia.
// Posizioni stilizzate ma proporzionate a lat/lng reali.
export const CITIES_MAP = [
  { city: "Milano", x: 35, y: 18, count: 68 },
  { city: "Torino", x: 22, y: 20, count: 14 },
  { city: "Bologna", x: 48, y: 27, count: 12 },
  { city: "Firenze", x: 46, y: 37, count: 9 },
  { city: "Roma", x: 52, y: 52, count: 31 },
  { city: "Napoli", x: 58, y: 63, count: 5 },
  { city: "Remoto", x: 80, y: 12, count: 28 },
];

export const TOP_COMPANIES = [
  { name: "Bending Spoons", applications: 4, responses: 3, color: "#0A0A0A" },
  { name: "Satispay", applications: 3, responses: 2, color: "#EF3E42" },
  { name: "Nexi", applications: 3, responses: 1, color: "#1B3C89" },
  { name: "Scalapay", applications: 2, responses: 2, color: "#FE5FA3" },
  { name: "Everli", applications: 2, responses: 2, color: "#FF2954" },
];

export const ROLE_PREFERENCES = [
  { title: "Product Designer", count: 1241, selected: true },
  { title: "Senior Product Designer", count: 684, selected: true },
  { title: "UX Designer", count: 1053, selected: true },
  { title: "UI Designer", count: 512, selected: false },
  { title: "Design Lead", count: 217, selected: false },
  { title: "Product Manager", count: 1876, selected: false },
];

export const LOCATION_PREFS = [
  { city: "Milano", count: 3421, selected: true },
  { city: "Roma", count: 1872, selected: true },
  { city: "Torino", count: 642, selected: false },
  { city: "Bologna", count: 488, selected: false },
  { city: "Remoto (IT)", count: 2140, selected: true },
  { city: "Remoto (EU)", count: 1560, selected: false },
];

export const PIPELINE = ["Applicata", "Vista", "Screening", "Colloquio", "Offerta"];
