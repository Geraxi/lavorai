/**
 * Segue il redirect Adzuna (o qualunque short-URL) per ottenere l'URL
 * finale del job posting reale — quello che ci dice davvero su quale
 * portale dovremmo candidarci.
 *
 * Adzuna restituisce URL tipo https://www.adzuna.it/land/ad/12345?... che
 * redirigono (302/301) verso boards.greenhouse.io/.../, jobs.lever.co/...,
 * apply.workable.com/..., linkedin.com/jobs/..., ecc.
 */

export async function resolveFinalUrl(
  url: string,
  maxHops = 5,
): Promise<string> {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    try {
      // HEAD sarebbe ideale ma molti server rispondono 405 — usiamo GET
      // con redirect: manual e seguiamo a mano
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(8_000),
      });
      // Abort the body we don't need
      await res.body?.cancel().catch(() => void 0);

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return current;
        // Absolute or relative
        try {
          current = new URL(loc, current).toString();
        } catch {
          return current;
        }
        continue;
      }
      return res.url || current; // URL finale (può differire se server redirect seguiti da fetch)
    } catch {
      return current;
    }
  }
  return current;
}
