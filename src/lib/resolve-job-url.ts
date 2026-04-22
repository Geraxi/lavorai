/**
 * Segue i redirect HTTP per ottenere l'URL finale del job posting reale.
 *
 * NOTA su Adzuna: il loro wrapper `/details/<id>` NON fa redirect HTTP —
 * è un client-side React app che mostra il job e monetizza il click-through.
 * L'URL `/land/ad/<id>?aztt=...` restituisce "Accesso Negato" al nostro
 * fetch server-side (bot detection). Quindi per job Adzuna questa funzione
 * ritorna l'URL originale senza cambio — serve Playwright per risolverli
 * (vedi resolveWithPlaywright in application-worker.ts).
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
