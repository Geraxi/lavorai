import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText, decodeHtmlEntities } from "./html-clean";

// Free, attributed feeds. Bounded requests; the daily sync handles refreshes.
const UA = "LavorAI/1.0 (+https://lavorai.it)";
const italy = /\b(italy|italia|IT)\b/i;
const worldwide = /worldwide|anywhere in the world|europe|emea/i;
function date(value: unknown): Date | null {
  const d = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : typeof value === "string" ? new Date(value) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}
function boardUrl(value: unknown, host: string): string | null {
  try { const u = new URL(String(value)); return u.protocol === "https:" && u.hostname === host ? u.href : null; } catch { return null; }
}
function job(source: string, url: string, title: string, postedAt: Date): JobListItem {
  return { id: "", externalId: url, source, sourceSlug: null, title, company: null, location: "Remote · Worldwide", description: "", url, contractType: null, remote: true, salaryMin: null, salaryMax: null, category: "Remote", postedAt, recruiterEmail: null, recruiterScrapedAt: null };
}

export function parseHimalayas(data: unknown, now = Date.now()): JobListItem[] {
  if (!data || typeof data !== "object" || !("jobs" in data) || !Array.isArray(data.jobs)) return [];
  const out = new Map<string, JobListItem>();
  for (const j of data.jobs) {
    if (!j || typeof j !== "object") continue;
    const url = boardUrl(j.guid ?? j.applicationLink, "himalayas.app");
    const posted = date(j.pubDate), expires = date(j.expiryDate);
    if (!url || typeof j.title !== "string" || !j.title.trim() || !posted || !expires || expires.getTime() <= now) continue;
    // Country restrictions override a generic remote label. Unknown shapes fail closed.
    if (!Array.isArray(j.locationRestrictions)) continue;
    const countries = j.locationRestrictions.map((v: unknown) => typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String(v.name) : "unknown");
    if (countries.length && !countries.some((v: string) => italy.test(v))) continue;
    const record = job("himalayas", url, cleanHtmlText(j.title), posted);
    record.company = typeof j.companyName === "string" ? j.companyName : null;
    record.description = cleanHtmlText(typeof j.description === "string" ? j.description : "").slice(0, 6000);
    record.location = `Remote · ${countries.length ? "Italy" : "Worldwide"}`;
    record.contractType = typeof j.employmentType === "string" ? j.employmentType : null;
    // The UI formats salary in EUR. Never relabel dollars as euros.
    if (j.currency === "EUR" && j.salaryPeriod === "annual") {
      record.salaryMin = typeof j.minSalary === "number" && Number.isFinite(j.minSalary) ? j.minSalary : null;
      record.salaryMax = typeof j.maxSalary === "number" && Number.isFinite(j.maxSalary) ? j.maxSalary : null;
    }
    out.set(url, record);
  }
  return [...out.values()];
}

export function parseWwr(xml: string, now = Date.now()): JobListItem[] {
  const out = new Map<string, JobListItem>();
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const tag = (name: string) => decodeHtmlEntities((match[1].match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
    const url = boardUrl(tag("link"), "weworkremotely.com");
    const title = cleanHtmlText(tag("title")), posted = date(tag("pubDate")), expires = date(tag("expires_at"));
    if (!url || !title || !posted || !expires || expires.getTime() <= now) continue;
    const country = tag("country"), region = tag("region"), description = cleanHtmlText(tag("description"));
    if (country ? !italy.test(country) : !worldwide.test(region)) continue;
    // WWR sometimes labels US-only listings as worldwide. Reject explicit restrictions.
    if (!country && /(?:remote\s*[-–:]\s*(?:US|USA|Canada|Australia)\b|\b(?:US|USA|United States|Canada|Australia)[ -]only\b|must (?:be (?:based|located)|reside|live) in (?:the )?(?:US|United States|Canada|UK)\b)/i.test(`${title} ${description}`)) continue;
    const split = title.indexOf(": ");
    const record = job("weworkremotely", url, split >= 0 ? title.slice(split + 2) : title, posted);
    record.company = split >= 0 ? title.slice(0, split) : null;
    record.location = `Remote · ${country || region}`;
    record.description = description.slice(0, 6000);
    record.contractType = tag("type") || null;
    record.category = tag("category") || "Remote";
    out.set(url, record);
  }
  return [...out.values()];
}

export async function fetchHimalayasJobs(): Promise<JobListItem[]> {
  const out = new Map<string, JobListItem>();
  for (let page = 1; page <= 5; page++) {
    try {
      const res = await fetch(`https://himalayas.app/jobs/api/search?country=IT&sort=recent&page=${page}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000), next: { revalidate: 86400 } });
      if (!res.ok) break; // Includes rate limiting: no retry storm.
      const data = await res.json();
      for (const j of parseHimalayas(data)) out.set(j.externalId, j);
      if (!Array.isArray(data.jobs) || data.jobs.length < 20) break;
    } catch (err) { console.warn("[himalayas] fetch failed", err instanceof Error ? err.message : err); break; }
  }
  return [...out.values()];
}
export async function fetchWwrJobs(): Promise<JobListItem[]> {
  try {
    const res = await fetch("https://weworkremotely.com/remote-jobs.rss", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000), next: { revalidate: 86400 } });
    return res.ok ? parseWwr(await res.text()) : [];
  } catch (err) { console.warn("[weworkremotely] fetch failed", err instanceof Error ? err.message : err); return []; }
}
