import { prisma } from "@/lib/db";

const ATS_RE = /greenhouse\.io|ashbyhq\.com|lever\.co|workable\.com|smartrecruiters\.com/i;

/**
 * Verifica leggera che l'annuncio sia ancora online: segue i redirect e
 * considera "chiuso" un 404/410, un redirect alla lista generica del board
 * (Greenhouse ?error=true, /<slug> senza id), un redirect fuori dall'ATS
 * (career page custom: l'adapter non troverà il form) o un body "Job not
 * found" (Ashby risponde 200 con quella pagina).
 * In caso di rete/timeout NON escludiamo (lo scoprirà l'adapter).
 */
export async function isJobUrlAlive(url: string): Promise<boolean> {
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
