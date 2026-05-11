import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";

/**
 * SmartRecruiters public posting API. Nessuna auth richiesta.
 *
 * URL: https://api.smartrecruiters.com/v1/companies/<companyId>/postings?limit=100
 * Risposta:
 *   { content: [{
 *       id, name, releasedDate, location: { city, country, region, remote },
 *       department: { label }, function: { label },
 *       jobAd: { sections: { jobDescription: { text } } },
 *       ref, ...
 *     }]
 *   }
 *
 * companyId è l'identificativo SmartRecruiters dell'azienda — visibile
 * nell'URL careers (es. https://careers.smartrecruiters.com/Bosch).
 */

interface SrPosting {
  id: string;
  uuid?: string;
  name: string;
  ref?: string;
  releasedDate?: string;
  location?: {
    city?: string;
    country?: string;
    region?: string;
    remote?: boolean;
  };
  department?: { label?: string };
  function?: { label?: string };
  industry?: { label?: string };
  jobAd?: {
    sections?: {
      jobDescription?: { text?: string };
      qualifications?: { text?: string };
    };
  };
  applyUrl?: string;
}

export async function fetchSmartRecruitersJobs(
  companyId: string,
  companyName?: string,
): Promise<JobListItem[]> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?limit=100`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`[smartrec] ${companyId} → ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { content?: SrPosting[] };
    const jobs = Array.isArray(data.content) ? data.content : [];
    const display = companyName ?? prettySlug(companyId);
    return jobs
      .map((j) => mapJob(j, display, companyId))
      .filter((j): j is JobListItem => j !== null);
  } catch (err) {
    console.warn(`[smartrec] ${companyId} fetch failed`, err);
    return [];
  }
}

export async function fetchSmartRecruitersMulti(
  companies: Array<{ slug: string; name?: string }>,
  concurrency = 4,
): Promise<JobListItem[]> {
  const out: JobListItem[] = [];
  const queue = [...companies];
  async function worker() {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) return;
      const list = await fetchSmartRecruitersJobs(c.slug, c.name);
      out.push(...list);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

function mapJob(
  j: SrPosting,
  companyName: string,
  companyId: string,
): JobListItem | null {
  const desc =
    (j.jobAd?.sections?.jobDescription?.text ?? "") +
    " " +
    (j.jobAd?.sections?.qualifications?.text ?? "");
  const description = cleanHtmlText(desc).slice(0, 2000);
  const locParts = [j.location?.city, j.location?.region, j.location?.country]
    .filter(Boolean)
    .join(", ");
  const isRemote = !!j.location?.remote;
  if (!isRelevantLocation(locParts, description, isRemote)) return null;

  // URL canonico apply: jobs.smartrecruiters.com/<companyId>/<jobId>
  const url =
    j.applyUrl ??
    `https://jobs.smartrecruiters.com/${encodeURIComponent(companyId)}/${encodeURIComponent(j.id)}`;

  return {
    id: "",
    externalId: String(j.id),
    source: "smartrecruiters",
    sourceSlug: companyId,
    title: j.name,
    company: companyName,
    location: locParts || null,
    description,
    url,
    contractType: null,
    remote: isRemote,
    salaryMin: null,
    salaryMax: null,
    category: j.department?.label ?? j.function?.label ?? "IT Jobs",
    postedAt: j.releasedDate ? new Date(j.releasedDate) : new Date(),
    recruiterEmail: null,
    recruiterScrapedAt: null,
  } as unknown as JobListItem;
}

function prettySlug(s: string): string {
  return s
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function isRelevantLocation(
  loc: string,
  description: string,
  isRemote: boolean,
): boolean {
  const combined = `${loc} ${description.slice(0, 400)}`.toLowerCase();
  const yes = [
    "italy", "italia", "milan", "milano", "rome", "roma", "torino", "turin",
    "firenze", "bologna",
    "europe", "europa", "eu ", "emea",
    "germany", "germania", "deutschland", "berlin", "munich", "münchen",
    "france", "francia", "paris", "spain", "spagna", "madrid", "barcelona",
    "netherlands", "amsterdam", "portugal", "lisbon", "ireland", "dublin",
    "belgium", "brussels", "austria", "vienna", "switzerland", "zurich",
    "denmark", "copenhagen", "sweden", "stockholm", "finland", "helsinki",
    "poland", "warsaw", "czech", "prague",
    "uk", "united kingdom", "london", "londra",
  ];
  const no = [
    "united states only", "us only", "usa only", "canada only",
    "apac only", "brazil", "mexico", "singapore only", "japan only",
    "india only", "anywhere in the us", "us-based",
  ];
  if (isRemote && !no.some((n) => combined.includes(n))) return true;
  if (/\bremote\b/.test(combined) && !no.some((n) => combined.includes(n)))
    return true;
  if (yes.some((y) => combined.includes(y))) return true;
  return false;
}
