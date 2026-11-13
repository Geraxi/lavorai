/**
 * Cheap HTTP preflight for public ATS apply forms.
 *
 * Goal: detect form_not_found BEFORE optimizeCV / tailor LLM calls (~40–60s),
 * so a 300s Vercel drain does not burn AI budget on unreachable forms.
 *
 * Never posts a candidacy. Never solves CAPTCHAs. Employer-keyed Candidate
 * Submission APIs (Greenhouse Harvest, Lever, Workable, Ashby) are intentionally
 * unused here — those keys belong to the employer, not to a third-party apply
 * agent. Recruitee’s public careers-site candidate endpoint is already handled
 * by the Recruitee adapter (HTTP apply), not by this probe.
 */

export type FormProbeResult =
  | { status: "present"; detail: string }
  | { status: "missing"; detail: string }
  | { status: "unknown"; detail: string };

const UA = "LavorAIBot/1.0 (+https://lavorai.it; form-probe)";
const TIMEOUT_MS = 8_000;

async function getText(url: string): Promise<{ ok: boolean; status: number; finalUrl: string; body: string }> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    return { ok: response.ok, status: response.status, finalUrl: response.url || url, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      body: err instanceof Error ? err.message : "fetch_failed",
    };
  }
}

function leverApplyCandidates(jobUrl: string): string[] {
  const base = jobUrl.replace(/\/$/, "").replace(/\/apply$/i, "");
  return [`${base}/apply`, base];
}

function personioApplyCandidates(jobUrl: string): string[] {
  try {
    const u = new URL(jobUrl);
    u.hash = "";
    const clean = u.toString().replace(/\/$/, "");
    const withApply = /\/apply\/?$/i.test(u.pathname) ? clean : `${clean}/apply`;
    return [withApply, `${clean}#apply`, clean];
  } catch {
    return [jobUrl];
  }
}

function bodyLooksLikeLeverForm(body: string): boolean {
  return /name=["']name["']/.test(body) && /name=["']email["']/.test(body);
}

function bodyLooksLikePersonioForm(body: string): boolean {
  return /name=["']first_name["']/.test(body) && /name=["']email["']/.test(body);
}

function bodyLooksLikeGreenhouseForm(body: string): boolean {
  return /name=["']first_name["']/.test(body) && /name=["']email["']/.test(body);
}

/** Probe whether a public apply form is reachable without opening Playwright. */
export async function probePortalForm(
  adapterId: string,
  jobUrl: string,
  fetchText: typeof getText = getText,
): Promise<FormProbeResult> {
  if (adapterId === "lever") {
    let last = "";
    for (const url of leverApplyCandidates(jobUrl)) {
      const res = await fetchText(url);
      last = `${res.status} ${res.finalUrl}`;
      if (!res.ok) continue;
      if (!/lever\.co/i.test(res.finalUrl)) {
        return { status: "missing", detail: `redirected_off_lever:${res.finalUrl}` };
      }
      if (bodyLooksLikeLeverForm(res.body)) {
        return { status: "present", detail: `lever_form:${res.finalUrl}` };
      }
    }
    return { status: "missing", detail: `lever_form_absent:${last}` };
  }

  if (adapterId === "personio") {
    let last = "";
    for (const url of personioApplyCandidates(jobUrl)) {
      const res = await fetchText(url);
      last = `${res.status} ${res.finalUrl}`;
      if (!res.ok) continue;
      if (!/personio\.(com|de)/i.test(res.finalUrl)) {
        return { status: "missing", detail: `redirected_off_personio:${res.finalUrl}` };
      }
      if (bodyLooksLikePersonioForm(res.body)) {
        return { status: "present", detail: `personio_form:${res.finalUrl}` };
      }
    }
    return { status: "missing", detail: `personio_form_absent:${last}` };
  }

  if (adapterId === "greenhouse") {
    const res = await fetchText(jobUrl.includes("/apply") ? jobUrl : `${jobUrl.replace(/\/$/, "")}/apply`);
    if (!res.ok) return { status: "unknown", detail: `greenhouse_http_${res.status}` };
    if (!/greenhouse\.io/i.test(res.finalUrl)) {
      return { status: "unknown", detail: `greenhouse_redirect:${res.finalUrl}` };
    }
    if (bodyLooksLikeGreenhouseForm(res.body)) {
      return { status: "present", detail: `greenhouse_form:${res.finalUrl}` };
    }
    return { status: "unknown", detail: "greenhouse_form_not_in_html" };
  }

  return { status: "unknown", detail: `no_probe_for_${adapterId}` };
}

/** Prefer the first probe URL that actually contains the form (Personio /apply). */
export function preferredApplyUrl(adapterId: string, jobUrl: string, probeDetail: string): string {
  const m = probeDetail.match(/:(https?:\/\/\S+)/);
  if (m?.[1]) return m[1];
  if (adapterId === "personio") {
    try {
      const u = new URL(jobUrl);
      u.hash = "";
      const clean = u.toString().replace(/\/$/, "");
      return /\/apply\/?$/i.test(u.pathname) ? clean : `${clean}/apply`;
    } catch {
      return jobUrl;
    }
  }
  if (adapterId === "lever") {
    return jobUrl.replace(/\/$/, "").replace(/\/apply$/i, "") + "/apply";
  }
  return jobUrl;
}
