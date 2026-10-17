import { prisma } from "@/lib/db";

/** Persisted by the worker when a posting could not be verified (temporary).
 * held-application-release.ts re-checks only rows carrying exactly this text. */
export const JOB_LIVENESS_UNKNOWN_HELD_MESSAGE = "Disponibilità dell'annuncio non verificabile: invio sospeso, nuovo controllo più tardi.";
export const JOB_CLOSED_HELD_MESSAGE = "Annuncio chiuso dall'azienda. Nessun invio effettuato.";

export type JobLivenessState = "live" | "closed" | "unknown";
export type JobLivenessResult = {
  state: JobLivenessState;
  reason: string;
  checkedAt: Date;
  finalUrl?: string;
};
const BROWSER_HEADERS = { "user-agent": "Mozilla/5.0", accept: "text/html,application/json" };
const domainIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const ATS_DOMAINS = ["greenhouse.io", "ashbyhq.com", "lever.co", "workable.com", "smartrecruiters.com", "recruitee.com", "teamtailor.com", "bamboohr.com", "breezy.hr", "pinpointhq.com"];

/** Only conclusive removal evidence can close a shared vacancy. Failures,
 * challenges and unrecognised pages remain unknown, which cannot auto-send.
 */
export async function checkJobUrlLiveness(url: string): Promise<JobLivenessResult> {
  const checkedAt = new Date();
  const result = (state: JobLivenessState, reason: string, finalUrl?: string): JobLivenessResult => ({ state, reason, checkedAt, finalUrl });
  let original: URL;
  try { original = new URL(url); } catch { return result("unknown", "invalid_url"); }
  if (!["https:", "http:"].includes(original.protocol) || original.username || original.password) return result("unknown", "invalid_url");
  const api = await checkViaAtsApi(original);
  if (api) return result(api.state, api.reason, url);
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: BROWSER_HEADERS });
    const finalUrl = response.url || url;
    if (response.status === 404 || response.status === 410) return result("closed", `http_${response.status}`, finalUrl);
    if (!response.ok) return result("unknown", `http_${response.status}`, finalUrl);
    const final = new URL(finalUrl);
    if (/[?&]error=true(?:&|$)/i.test(final.search)) return result("closed", "job_error_redirect", finalUrl);
    if (ATS_DOMAINS.some((domain) => domainIs(original.hostname, domain))) {
      if (original.hostname !== final.hostname) return result("unknown", "changed_posting_host", finalUrl);
      if (["greenhouse.io", "ashbyhq.com", "lever.co"].some((domain) => domainIs(final.hostname, domain))
        && /^\/[^/]+\/?$/.test(final.pathname)) return result("closed", "redirected_to_job_board", finalUrl);
    } else if (original.hostname !== final.hostname) return result("unknown", "changed_posting_host", finalUrl);
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return result("unknown", "unexpected_content_type", finalUrl);
    const html = (await response.text()).slice(0, 300_000);
    const visible = html.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (/job (?:was )?not found|this (?:job|position) is no longer|(?:this|the) position (?:has been |is )(?:filled|closed)|no longer accepting applications|questa posizione non è più|annuncio (?:non è più|scaduto)/i.test(visible)
      || /"posting"\s*:\s*null/.test(html)) return result("closed", "posting_closed_message", finalUrl);
    if (/captcha|verify (?:you are|that you are) human|access denied|just a moment|sign in to continue/i.test(visible)) return result("unknown", "challenge_or_login", finalUrl);
    // A 200 status alone is not proof: login pages, empty SPA shells and generic
    // career pages cannot safely stand in for an actual application posting.
    const posting = /["']@type["']\s*:\s*["']JobPosting["']|"posting"\s*:\s*\{|<h1\b/i.test(html);
    const application = /\b(apply (?:now|for|to)|submit (?:your )?application|send (?:your )?(?:cv|resume)|candidati|invia(?:re)? (?:il |la |una )?(?:cv|candidatura)|application form)\b/i.test(visible)
      || /<form\b[^>]*(?:application|apply)|href=["'][^"']*\/(?:apply|application)(?:[/?#"'])/i.test(html);
    return posting && application ? result("live", "posting_with_application_context", finalUrl) : result("unknown", "posting_not_verified", finalUrl);
  } catch { return result("unknown", "network_or_timeout"); }
}

/** Compatibility for read-only callers. Never use false to mark a job closed;
 * consumers that persist closure must inspect checkJobUrlLiveness().state.
 */
export async function isJobUrlAlive(url: string): Promise<boolean> {
  return (await checkJobUrlLiveness(url)).state === "live";
}

export async function markJobClosed(jobId: string): Promise<void> {
  await prisma.job.update({ where: { id: jobId }, data: { closedAt: new Date() } }).catch(() => void 0);
}

type ApiVerdict = Pick<JobLivenessResult, "state" | "reason">;
async function getJson(url: string): Promise<{ status: number; json: unknown } | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json", "user-agent": "LavorAI/1.0" } });
    return { status: response.status, json: await response.json().catch(() => null) };
  } catch { return null; }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
async function checkViaAtsApi(url: URL): Promise<ApiVerdict | null> {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let apiUrl: string | null = null;
  let id: string | null = null;
  if (domainIs(host, "greenhouse.io")) {
    const match = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
    const slug = match?.[1] ?? (url.pathname === "/embed/job_app" ? url.searchParams.get("for") : null);
    id = match?.[2] ?? (url.pathname === "/embed/job_app" ? url.searchParams.get("token") : null);
    if (slug && id && /^\d+$/.test(id)) apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${id}`;
  } else if (domainIs(host, "ashbyhq.com")) {
    const [slug, uuid] = parts;
    if (!slug || !uuid || !/^[0-9a-f-]{20,}$/i.test(uuid)) return null;
    const response = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
    if (response?.status !== 200 || !object(response.json) || !Array.isArray(response.json.jobs)) return null;
    const jobs = response.json.jobs;
    if (jobs.some((job) => !object(job) || typeof job.id !== "string")) return null;
    return jobs.some((job) => object(job) && (job.id as string).toLowerCase() === uuid.toLowerCase())
      ? { state: "live", reason: "ats_api_posting_present" } : { state: "closed", reason: "ats_api_posting_removed" };
  } else if (domainIs(host, "lever.co")) {
    if (parts[0] && parts[1]) { id = parts[1]; apiUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(parts[0])}/${encodeURIComponent(id)}`; }
  } else if (domainIs(host, "workable.com")) {
    const match = url.pathname.match(/^\/([^/]+)\/j\/([A-Za-z0-9]+)/);
    if (match) { id = match[2]; apiUrl = `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(match[1])}/jobs/${encodeURIComponent(id)}`; }
  } else if (domainIs(host, "smartrecruiters.com") && parts[0] && parts[1]) {
    id = parts[1].split("-")[0]; apiUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(parts[0])}/postings/${encodeURIComponent(id)}`;
  }
  if (!apiUrl || !id) return null;
  const response = await getJson(apiUrl);
  if (!response) return null;
  if ([404, 410].includes(response.status)) return { state: "closed", reason: `ats_api_${response.status}` };
  if (response.status !== 200 || !object(response.json)) return null;
  const body = response.json;
  const responseId = body.id ?? body.shortcode;
  // Validate the response shape/id; an API returning a 200 login/error payload
  // must never override an unknown or closed HTML page.
  if (String(responseId ?? "").toLowerCase() !== id.toLowerCase() || typeof (body.title ?? body.text ?? body.name) !== "string") return null;
  if (body.state === "closed" || body.isPublished === false) return { state: "closed", reason: "ats_api_posting_closed" };
  return { state: "live", reason: "ats_api_posting_present" };
}
