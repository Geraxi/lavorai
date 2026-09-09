import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";
import { isEuRelevant, runPool } from "./feed-utils";

/**
 * Personio — feed XML pubblico per ogni tenant, nessuna auth:
 *   https://<tenant>.jobs.personio.de/xml?language=it|en
 * Pagina annuncio (con form pubblico): https://<tenant>.jobs.personio.de/job/<id>
 */

export async function fetchPersonioJobs(tenant: string, companyName?: string): Promise<JobListItem[]> {
  // Il tenant vive su .com o .de a seconda dell'account: proviamo entrambi.
  let base = `https://${tenant}.jobs.personio.com`;
  try {
    let res = await fetch(`${base}/xml?language=en`, { headers: { "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res || !res.ok) {
      base = `https://${tenant}.jobs.personio.de`;
      res = await fetch(`${base}/xml?language=en`, { headers: { "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    }
    if (!res || !res.ok) return [];
    const xml = await res.text();
    if (!xml.includes("<position>")) return [];
    const out: JobListItem[] = [];
    for (const block of xml.split("<position>").slice(1)) {
      const pos = block.split("</position>")[0];
      const get = (tag: string) => {
        const m = pos.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
        return m ? decode(m[1]) : "";
      };
      const id = get("id");
      const title = get("name");
      if (!id || !title) continue;
      const office = get("office");
      const extra = [...pos.matchAll(/<additionalOffices>[\s\S]*?<\/additionalOffices>/g)].flatMap((m) => [...m[0].matchAll(/<office>([\s\S]*?)<\/office>/g)].map((x) => decode(x[1])));
      const loc = [office, ...extra].filter(Boolean).join(" · ") || null;
      const descParts = [...pos.matchAll(/<jobDescription>[\s\S]*?<value>([\s\S]*?)<\/value>/g)].map((m) => cleanHtmlText(m[1].replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "")));
      const description = descParts.join("\n").slice(0, 2000);
      const schedule = get("schedule");
      const remote = /remote|remoto|home office|homeoffice/i.test(`${loc ?? ""} ${description.slice(0, 300)}`);
      if (!isEuRelevant(`${loc ?? ""} ${remote ? "remote" : ""}`, description)) continue;
      const created = get("createdAt");
      out.push({
        id: "",
        externalId: id,
        source: "personio",
        sourceSlug: tenant,
        title,
        company: companyName || get("subcompany") || prettySlug(tenant),
        location: loc,
        description,
        url: `${base}/job/${id}`,
        contractType: get("employmentType") || schedule || null,
        remote,
        salaryMin: null,
        salaryMax: null,
        category: get("recruitingCategory") || get("department") || "Altro",
        postedAt: created ? new Date(created) : new Date(),
        recruiterEmail: null,
        recruiterScrapedAt: null,
      } as unknown as JobListItem);
    }
    return out;
  } catch (err) {
    console.warn(`[personio] ${tenant} fetch failed`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchPersonioMulti(companies: Array<{ slug: string; name?: string }>, concurrency = 4): Promise<JobListItem[]> {
  return runPool(companies, concurrency, (c) => fetchPersonioJobs(c.slug, c.name));
}

function decode(s: string): string {
  return s
    .replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "")
    .replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}
function prettySlug(s: string): string {
  return s.split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
}
