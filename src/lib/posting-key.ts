/**
 * Canonical identity of a job POSTING, independent of our internal Job rows.
 *
 * The same posting can be imported several times (board listing promoted to
 * its ATS URL, the same Greenhouse job on boards./job-boards./a careers page
 * with ?gh_jid=, tracking parameters, trailing slashes...). Duplicate
 * prevention compares these keys, never only `jobId`.
 *
 * Pure: no database, network or provider SDK. Safe in API/UI code.
 */
import { receiptJobId } from "@/lib/submission-receipt";

const TRACKING_PARAMS = /^(?:utm_[a-z_]+|gh_src|source|src|ref|referrer|lever-source|lever-origin|trk|trackingid|refid|fbclid|gclid|mc_[a-z]+|_hs[a-z]+)$/i;

/** Host → ATS provider for hosts whose path carries a stable posting id. */
function providerForHost(hostname: string): string | null {
  const host = hostname.toLowerCase();
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is("ashbyhq.com")) return "ashby";
  if (is("lever.co")) return "lever";
  if (is("workable.com")) return "workable";
  if (is("recruitee.com")) return "recruitee";
  if (is("personio.de") || is("personio.com")) return "personio";
  if (is("teamtailor.com")) return "teamtailor";
  if (is("bamboohr.com")) return "bamboohr";
  if (is("breezy.hr")) return "breezy";
  if (is("pinpointhq.com")) return "pinpoint";
  if (is("smartrecruiters.com")) return "smartrecruiters";
  return null;
}

function greenhousePosting(url: URL): string | null {
  const native = /^(?:boards|job-boards|jobs)\.greenhouse\.io$/i.test(url.hostname);
  const posting = native
    ? url.pathname.match(/\/jobs\/(\d+)(?:\/|$)/)?.[1] ?? (url.pathname === "/embed/job_app" ? url.searchParams.get("token") : null)
    : url.searchParams.get("gh_jid");
  return posting && /^\d+$/.test(posting) ? posting : null;
}

/**
 * Stable key for duplicate detection, or null when the value is not an
 * http(s) URL. Provider postings get a provider-scoped key; everything else
 * gets a normalized URL key (lower-case host without www., no hash, no
 * tracking parameters, no trailing "/apply" or slash, remaining query sorted).
 */
export function canonicalPostingKey(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
  const greenhouse = greenhousePosting(url);
  if (greenhouse) return `greenhouse:${greenhouse}`;
  const provider = providerForHost(url.hostname);
  if (provider) {
    const id = receiptJobId(provider, url.toString());
    if (id) {
      // Recruitee/Personio/Teamtailor/BambooHR/Breezy ids are tenant-scoped.
      const tenantScoped = ["recruitee", "personio", "teamtailor", "bamboohr", "breezy"].includes(provider);
      return tenantScoped ? `${provider}:${url.hostname.toLowerCase()}:${id.toLowerCase()}` : `${provider}:${id.toLowerCase()}`;
    }
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let path = url.pathname.replace(/\/+$/, "").replace(/\/(?:apply|application|candidatura|candidati)$/i, "");
  if (!path) path = "/";
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}` : "";
  return `url:${host}${path}${query}`;
}

/** Persisted (with submitConfirmation NOT_SUBMITTED) when the submit gate
 * refuses a second submission to a posting the user already has a possible
 * submission for. Read by application-lifecycle.ts as failure "duplicate_posting". */
export const DUPLICATE_POSTING_MESSAGE = "Candidatura già presente per questo stesso annuncio: non la inviamo due volte. Nessun nuovo invio effettuato.";
