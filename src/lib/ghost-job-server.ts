import { prisma } from "@/lib/db";
import { REPOST_WINDOW_DAYS, normalizeCompany, scoreGhostJob, type GhostJobInput, type GhostJobResult, type GhostJobSibling } from "@/lib/ghost-job";

/**
 * Calcola il rischio "annuncio fantasma" per una lista di job, caricando con
 * UNA query gli altri annunci in cache delle stesse aziende (ultimi 90 giorni).
 * Nessuna chiamata di rete: il link morto viene letto da Job.closedAt.
 */
export async function scoreGhostJobs(jobs: GhostJobInput[], now = new Date()): Promise<Map<string, GhostJobResult>> {
  const out = new Map<string, GhostJobResult>();
  if (jobs.length === 0) return out;
  const companies = [...new Set(jobs.map((j) => j.company?.trim()).filter((c): c is string => !!c))];
  let siblings: GhostJobSibling[] = [];
  if (companies.length > 0) {
    try {
      siblings = await prisma.job.findMany({
        where: { OR: companies.map((c) => ({ company: { equals: c, mode: "insensitive" as const } })) },
        select: { id: true, title: true, company: true, location: true, postedAt: true, closedAt: true },
        take: 5000,
      });
    } catch (err) {
      console.warn("[ghost-job] siblings query failed", err instanceof Error ? err.message : err);
    }
  }
  const since = now.getTime() - REPOST_WINDOW_DAYS * 86_400_000;
  const byCompany = new Map<string, GhostJobSibling[]>();
  for (const s of siblings) {
    if (s.postedAt && new Date(s.postedAt).getTime() < since) continue;
    const k = normalizeCompany(s.company);
    const arr = byCompany.get(k) ?? [];
    arr.push(s);
    byCompany.set(k, arr);
  }
  for (const j of jobs) out.set(j.id, scoreGhostJob(j, byCompany.get(normalizeCompany(j.company)) ?? [], now));
  return out;
}
