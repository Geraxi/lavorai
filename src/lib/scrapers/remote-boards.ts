import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";

/**
 * Board di lavoro remoto con API pubbliche senza chiave:
 *   - Remotive   https://remotive.com/api/remote-jobs
 *   - Jobicy     https://jobicy.com/api/v2/remote-jobs
 *   - RemoteOK   https://remoteok.com/api
 *
 * Tutte rimandano alla propria pagina annuncio (link-out): niente submit
 * automatico, ma arricchiscono il pool di offerte remote per l'Europa e
 * alimentano le pagine pubbliche /lavoro. Teniamo solo le offerte aperte
 * a candidati in Europa/Italia (o "worldwide").
 */

const UA = "Mozilla/5.0 LavorAI/1.0 jobs-sync";
const EU_GEO = /worldwide|anywhere|global|europe|europa|emea|italy|italia|\beu\b|remote|cet|utc/i;
const NON_EU_ONLY = /^(usa?|united states|us only|canada|latam|apac|india|australia|uk only|united kingdom only)$/i;

function geoOk(geo: string | null | undefined): boolean {
  const g = (geo ?? "").trim();
  if (!g) return true;
  if (NON_EU_ONLY.test(g)) return false;
  return EU_GEO.test(g) || /,\s*(italy|italia|spain|germany|france|netherlands|portugal|ireland)/i.test(g);
}

function item(partial: Partial<JobListItem> & { externalId: string; source: string; title: string; url: string }): JobListItem {
  return {
    id: "",
    sourceSlug: null,
    company: null,
    location: "Remote",
    description: "",
    contractType: null,
    remote: true,
    salaryMin: null,
    salaryMax: null,
    category: "Remote",
    postedAt: new Date(),
    recruiterEmail: null,
    recruiterScrapedAt: null,
    ...partial,
  } as unknown as JobListItem;
}

export async function fetchRemotiveJobs(): Promise<JobListItem[]> {
  try {
    // Senza `limit` l'API restituisce l'intero listato attivo (~1000+).
    const res = await fetch("https://remotive.com/api/remote-jobs", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs?: Array<{ id: number; url: string; title: string; company_name: string; category: string; job_type: string; publication_date: string; candidate_required_location: string; salary?: string; description: string }> };
    return (data.jobs ?? [])
      .filter((j) => geoOk(j.candidate_required_location))
      .map((j) =>
        item({
          externalId: String(j.id),
          source: "remotive",
          title: j.title,
          company: j.company_name || null,
          location: `Remote · ${j.candidate_required_location || "Worldwide"}`,
          description: cleanHtmlText(j.description ?? "").slice(0, 2000),
          url: j.url,
          contractType: j.job_type?.replace("_", " ") ?? null,
          category: j.category || "Remote",
          postedAt: j.publication_date ? new Date(j.publication_date) : new Date(),
        }),
      );
  } catch (err) {
    console.warn("[remotive] fetch failed", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchJobicyJobs(count = 100): Promise<JobListItem[]> {
  // Tre viste: globale, Europa, Italia (dedupe per id). Il feed default è
  // dominato da USA-only, che scartiamo.
  const seen = new Set<string>();
  const out: JobListItem[] = [];
  for (const geo of ["", "europe", "italy"]) {
    try {
      const res = await fetch(`https://jobicy.com/api/v2/remote-jobs?count=${count}${geo ? `&geo=${geo}` : ""}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { jobs?: Array<{ id: number; url: string; jobTitle: string; companyName: string; jobIndustry?: string[]; jobType?: string[]; jobGeo?: string; pubDate: string; jobDescription?: string; jobExcerpt?: string; annualSalaryMin?: number; annualSalaryMax?: number }> };
      for (const j of data.jobs ?? []) {
        if (seen.has(String(j.id)) || !geoOk(j.jobGeo)) continue;
        seen.add(String(j.id));
        out.push(
          item({
            externalId: String(j.id),
            source: "jobicy",
            title: j.jobTitle,
            company: j.companyName || null,
            location: `Remote · ${j.jobGeo || "Anywhere"}`,
            description: cleanHtmlText(j.jobDescription ?? j.jobExcerpt ?? "").slice(0, 2000),
            url: j.url,
            contractType: j.jobType?.[0] ?? null,
            category: j.jobIndustry?.[0] ?? "Remote",
            postedAt: j.pubDate ? new Date(j.pubDate) : new Date(),
            salaryMin: j.annualSalaryMin ?? null,
            salaryMax: j.annualSalaryMax ?? null,
          }),
        );
      }
    } catch (err) {
      console.warn("[jobicy] fetch failed", err instanceof Error ? err.message : err);
    }
  }
  return out;
}

export async function fetchRemoteOkJobs(): Promise<JobListItem[]> {
  try {
    const res = await fetch("https://remoteok.com/api", { headers: { "User-Agent": "Mozilla/5.0 (compatible; LavorAI/1.0)" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ id?: string; url?: string; position?: string; company?: string; location?: string; tags?: string[]; date?: string; description?: string; salary_min?: number; salary_max?: number }>;
    return data
      .filter((j) => j.id && j.position && j.url && geoOk(j.location))
      .map((j) =>
        item({
          externalId: String(j.id),
          source: "remoteok",
          title: j.position!,
          company: j.company || null,
          location: `Remote · ${j.location || "Worldwide"}`,
          description: cleanHtmlText(j.description ?? "").slice(0, 2000),
          url: j.url!,
          category: j.tags?.[0] ?? "Remote",
          postedAt: j.date ? new Date(j.date) : new Date(),
          salaryMin: j.salary_min || null,
          salaryMax: j.salary_max || null,
        }),
      );
  } catch (err) {
    console.warn("[remoteok] fetch failed", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchRemoteBoards(): Promise<JobListItem[]> {
  const [a, b, c] = await Promise.all([fetchRemotiveJobs(), fetchJobicyJobs(), fetchRemoteOkJobs()]);
  console.log(`[remote-boards] remotive=${a.length} jobicy=${b.length} remoteok=${c.length}`);
  return [...a, ...b, ...c];
}
