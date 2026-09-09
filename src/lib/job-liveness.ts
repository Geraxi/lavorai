import { prisma } from "@/lib/db";

const ATS_RE = /greenhouse\.io|ashbyhq\.com|lever\.co|workable\.com|smartrecruiters\.com|recruitee\.com|jobs\.personio\.|teamtailor\.com|bamboohr\.com/i;

/**
 * Verifica leggera che l'annuncio sia ancora online: segue i redirect e
 * considera "chiuso" un 404/410, un redirect alla lista generica del board
 * (Greenhouse ?error=true, /<slug> senza id), un redirect fuori dall'ATS
 * (career page custom: l'adapter non troverà il form) o un body "Job not
 * found" (Ashby risponde 200 con quella pagina).
 * In caso di rete/timeout NON escludiamo (lo scoprirà l'adapter).
 */
export async function isJobUrlAlive(url: string): Promise<boolean> {
  // 1) API ufficiali degli ATS: risposta certa (le pagine sono SPA e il
  //    server HTML non contiene "Job not found" → il check HTML non basta).
  const viaApi = await checkViaAtsApi(url);
  if (viaApi !== null) return viaApi;
  // 2) Fallback: HTTP + redirect + body.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0 Safari/537.36", accept: "text/html,*/*" },
    });
    clearTimeout(t);
    if (res.status === 404 || res.status === 410) return false;
    const final = res.url || url;
    if (/[?&]error=true/i.test(final)) return false;
    if (ATS_RE.test(url)) {
      if (!ATS_RE.test(final)) return false;
      if (/greenhouse\.io\/[^/?#]+\/?(\?.*)?$/i.test(final)) return false;
      if (/ashbyhq\.com\/[^/?#]+\/?(\?.*)?$/i.test(final)) return false;
    }
    if (!res.ok) return res.status < 400;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) {
      const html = (await res.text()).slice(0, 200_000);
      if (/job (was )?not found|this job is no longer|position (has been )?(filled|closed)|no longer accepting applications|questa posizione non è più|annuncio (non è più|scaduto)/i.test(html)) return false;
    }
    return true;
  } catch {
    return true;
  }
}

/** Marca il job come chiuso (idempotente). */
export async function markJobClosed(jobId: string): Promise<void> {
  await prisma.job.update({ where: { id: jobId }, data: { closedAt: new Date() } }).catch(() => void 0);
}


async function getText(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36", accept: "text/html" } });
    clearTimeout(t);
    return await res.text();
  } catch {
    return null;
  }
}

async function getJson(url: string, timeoutMs = 8000): Promise<{ status: number; json: unknown } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": "LavorAI/1.0 (+https://lavorai.it)" } });
    clearTimeout(t);
    let json: unknown = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  } catch {
    return null;
  }
}

/**
 * true/false se l'API dell'ATS dà una risposta certa, null se non applicabile
 * o non raggiungibile (→ si passa al fallback HTML).
 */
async function checkViaAtsApi(url: string): Promise<boolean | null> {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  // Greenhouse: boards|job-boards.greenhouse.io/<slug>/jobs/<id> | embed/job_app?for=<slug>&token=<id>
  if (host.endsWith("greenhouse.io")) {
    let slug: string | null = null; let id: string | null = null;
    const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
    if (m) { slug = m[1]; id = m[2]; }
    else if (u.pathname.startsWith("/embed/job_app")) { slug = u.searchParams.get("for"); id = u.searchParams.get("token"); }
    if (!slug || !id) return null;
    const r = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${id}`);
    if (!r) return null;
    if (r.status === 404) return false;
    if (r.status === 200) return true;
    return null;
  }

  // Ashby: jobs.ashbyhq.com/<slug>/<uuid>[/application]
  if (host.endsWith("ashbyhq.com")) {
    const slug = parts[0]; const uuid = parts[1];
    if (!slug || !uuid || !/^[0-9a-f-]{20,}$/i.test(uuid)) return null;
    const r = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
    const jobs = r && r.status === 200 ? (r.json as { jobs?: Array<{ id?: string; jobUrl?: string }> } | null)?.jobs : undefined;
    if (Array.isArray(jobs) && jobs.length > 0) {
      return jobs.some((j) => (j.id ?? "").toLowerCase() === uuid.toLowerCase() || (j.jobUrl ?? "").toLowerCase().includes(uuid.toLowerCase()));
    }
    // Board vuoto o API non disponibile: la pagina SPA di Ashby incorpora
    // window.__appData con "posting":null quando l'annuncio non esiste più.
    const html = await getText(`https://jobs.ashbyhq.com/${encodeURIComponent(slug)}/${encodeURIComponent(uuid)}`);
    if (html == null) return null;
    if (/"posting":null/.test(html)) return false;
    if (/"posting":\{/.test(html)) return true;
    return null;
  }

  // Lever: jobs.lever.co/<slug>/<uuid>[/apply]
  if (host.endsWith("lever.co")) {
    const slug = parts[0]; const id = parts[1];
    if (!slug || !id) return null;
    const r = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`);
    if (!r) return null;
    if (r.status === 404) return false;
    if (r.status === 200) return true;
    return null;
  }

  // Workable: apply.workable.com/<slug>/j/<code>
  if (host.endsWith("workable.com")) {
    const m = u.pathname.match(/^\/([^/]+)\/j\/([A-Za-z0-9]+)/);
    if (!m) return null;
    const r = await getJson(`https://apply.workable.com/api/v2/accounts/${encodeURIComponent(m[1])}/jobs/${encodeURIComponent(m[2])}`);
    if (!r) return null;
    if (r.status === 404) return false;
    if (r.status === 200) return true;
    return null;
  }

  // SmartRecruiters: jobs.smartrecruiters.com/<company>/<id>[-slug]
  if (host.endsWith("smartrecruiters.com")) {
    const company = parts[0]; const idPart = parts[1];
    if (!company || !idPart) return null;
    const id = idPart.split("-")[0];
    const r = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(id)}`);
    if (!r) return null;
    if (r.status === 404) return false;
    if (r.status === 200) return true;
    return null;
  }

  return null;
}
