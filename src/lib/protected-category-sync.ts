import { prisma } from "@/lib/db";
import { searchAndCacheJobs } from "@/lib/jobs-repo";
import { PROTECTED_SEARCH_PHRASES } from "@/lib/protected-category";

/**
 * Sweep giornaliero (cron sync-jobs) per le categorie protette (L. 68/99):
 *  1. ricerca dedicata su Adzuna Italia per frase esatta, nelle principali
 *     aree (le aziende obbligate per legge pubblicano ovunque, ma il
 *     grosso è nelle città grandi);
 *  2. marcatura in DB di tutti gli annunci il cui titolo/descrizione lo
 *     dichiara, qualunque sia la fonte (ATS inclusi).
 */
const AREAS = ["Italia", "Milano", "Roma", "Torino", "Bologna", "Napoli"];

export async function syncProtectedCategoryJobs(): Promise<{ fetched: number; tagged: number }> {
  let fetched = 0;
  for (const phrase of PROTECTED_SEARCH_PHRASES) {
    for (const where of AREAS) {
      try {
        const rows = await searchAndCacheJobs({ whatPhrase: phrase, where, resultsPerPage: 50, protectedOnly: true });
        fetched += rows.length;
      } catch (err) {
        console.warn(`[protected-category] Adzuna "${phrase}" @ ${where} failed`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Marcatura testuale su tutto il pool recente (ultimi 60 giorni), fonti ATS incluse.
  const since = new Date(Date.now() - 60 * 86_400_000);
  const patterns = ["categorie protette", "categoria protetta", "68/99", "legge 68", "collocamento mirato", "invalidità civile"];
  const isPg = (process.env.DATABASE_URL ?? "").startsWith("postgres");
  const ci = isPg ? ({ mode: "insensitive" as const }) : ({} as Record<string, never>);
  const r = await prisma.job.updateMany({
    where: {
      protectedCategory: false,
      cachedAt: { gte: since },
      OR: patterns.flatMap((p) => [{ title: { contains: p, ...ci } }, { description: { contains: p, ...ci } }]),
    },
    data: { protectedCategory: true },
  });
  return { fetched, tagged: r.count };
}
