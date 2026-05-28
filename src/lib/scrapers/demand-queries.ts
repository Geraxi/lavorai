import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { searchJobs } from "@/lib/adzuna";
import type { JobListItem } from "@/lib/adzuna";

/**
 * Sourcing demand-driven: invece di scrapare solo i verticali hard-coded
 * (design/dev), peschiamo job in base ai ruoli che gli utenti REALI hanno
 * selezionato nelle preferenze e nei round attivi. Così se un utente cerca
 * "Meteorologo" o "Analista Climatico", il pool si popola con quei ruoli
 * anche se nessun nostro scraper ATS li copre.
 *
 * Fonte query: UserPreferences.rolesJson (utenti non-test) + titoli dei
 * round (ApplicationSession) attivi. Le location vengono dalle preferenze
 * degli stessi utenti, normalizzate per Adzuna (endpoint .it).
 */

export interface DemandQuery {
  what: string;
  where: string;
}

const MAX_QUERIES = 40; // budget anti rate-limit Adzuna
const PER_QUERY_RESULTS = 25;

/** Mappa una località utente sul parametro `where` di Adzuna (Italia). */
function normalizeLocation(raw: string): string | null {
  const l = raw.trim().toLowerCase();
  if (!l) return null;
  if (l.includes("remot")) return "Italia"; // remoto → cerca a livello nazionale
  // Città/paesi noti: passthrough capitalizzato. Adzuna .it gestisce bene
  // i nomi italiani ("Milano", "Roma", "Bologna", "Torino", ...).
  return raw.trim();
}

/**
 * Raccoglie le query demand-driven dagli utenti reali.
 * Dedup case-insensitive su (what, where). Cap a MAX_QUERIES.
 */
export async function collectDemandQueries(): Promise<DemandQuery[]> {
  const prefs = await prisma.userPreferences.findMany({
    select: {
      rolesJson: true,
      locationsJson: true,
      user: { select: { email: true } },
    },
  });

  const activeRounds = await prisma.applicationSession.findMany({
    where: { status: { in: ["active", "auto"] } },
    select: { title: true, label: true, user: { select: { email: true } } },
  });

  // Conta quante volte ogni ruolo è richiesto → i più richiesti hanno
  // priorità quando tagliamo a MAX_QUERIES.
  const roleDemand = new Map<string, number>();
  const locationSet = new Set<string>();

  const addRole = (r: string) => {
    const t = r.trim();
    if (t.length < 2) return;
    const k = t.toLowerCase();
    roleDemand.set(k, (roleDemand.get(k) ?? 0) + 1);
  };

  for (const p of prefs) {
    if (isTestAccount(p.user?.email)) continue;
    safeArr(p.rolesJson).forEach(addRole);
    safeArr(p.locationsJson).forEach((loc) => {
      const n = normalizeLocation(loc);
      if (n) locationSet.add(n);
    });
  }
  for (const r of activeRounds) {
    if (isTestAccount(r.user?.email)) continue;
    const t = (r.title ?? r.label ?? "").replace(/^Round\s+/i, "");
    if (t) addRole(t);
  }

  // Fallback location se nessuno ha specificato nulla.
  const locations = locationSet.size > 0 ? [...locationSet] : ["Italia"];

  // Ordina i ruoli per domanda DESC, preservando il display originale.
  const displayByKey = new Map<string, string>();
  for (const p of prefs) {
    if (isTestAccount(p.user?.email)) continue;
    for (const r of safeArr(p.rolesJson)) {
      const k = r.trim().toLowerCase();
      if (!displayByKey.has(k)) displayByKey.set(k, r.trim());
    }
  }
  for (const r of activeRounds) {
    const t = (r.title ?? r.label ?? "").replace(/^Round\s+/i, "").trim();
    if (t && !displayByKey.has(t.toLowerCase())) displayByKey.set(t.toLowerCase(), t);
  }

  const rankedRoles = [...roleDemand.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => displayByKey.get(k) ?? k);

  // Genera coppie (ruolo × location nazionale) + (ruolo × città top).
  // Per non esplodere: ogni ruolo cerca prima "Italia" (copertura ampia),
  // poi al massimo 1-2 città se restano budget.
  const queries: DemandQuery[] = [];
  const seen = new Set<string>();
  const push = (what: string, where: string) => {
    const key = `${what.toLowerCase()}|${where.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ what, where });
  };

  // Pass 1: ogni ruolo a livello nazionale.
  for (const role of rankedRoles) {
    if (queries.length >= MAX_QUERIES) break;
    push(role, "Italia");
  }
  // Pass 2: ruoli più richiesti anche nelle città specifiche.
  const cities = locations.filter((l) => l.toLowerCase() !== "italia").slice(0, 4);
  for (const role of rankedRoles) {
    for (const city of cities) {
      if (queries.length >= MAX_QUERIES) break;
      push(role, city);
    }
    if (queries.length >= MAX_QUERIES) break;
  }

  return queries.slice(0, MAX_QUERIES);
}

/**
 * Esegue le query demand-driven su Adzuna e ritorna i job (da upsertare
 * dal chiamante). Serial con piccola pausa per rispettare il rate-limit.
 */
export async function fetchDemandJobs(): Promise<{
  queries: number;
  items: JobListItem[];
}> {
  const queries = await collectDemandQueries();
  const items: JobListItem[] = [];

  for (const q of queries) {
    try {
      const res = await searchJobs({
        what: q.what,
        where: q.where,
        resultsPerPage: PER_QUERY_RESULTS,
      });
      items.push(...res);
    } catch (err) {
      console.warn(
        `[demand-queries] "${q.what}" @ "${q.where}" failed:`,
        err instanceof Error ? err.message.slice(0, 120) : err,
      );
    }
    // piccola pausa anti rate-limit
    await new Promise((r) => setTimeout(r, 250));
  }

  return { queries: queries.length, items };
}

function safeArr(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
