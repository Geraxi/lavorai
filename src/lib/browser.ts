import type { Browser } from "playwright";

/**
 * Launcher browser unico per tutto il codice (portal adapters, onboarding,
 * resolve URL). Risolve il problema strutturale: su Vercel serverless il
 * pacchetto `playwright` completo NON ha il binario Chromium → `launch()`
 * fallisce → l'invio ATS non è mai partito in produzione.
 *
 * Strategia (scelta B del founder):
 *   - In produzione/serverless (Vercel/Lambda) → `@sparticuz/chromium`:
 *     binario Chromium compresso compatibile con l'ambiente Lambda, guidato
 *     da `playwright-core`.
 *   - In locale (dev) → `playwright` completo coi browser bundlati.
 *
 * Stesso API Playwright in entrambi i casi: il resto del codice non cambia.
 */

const BASE_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
];

function isServerless(): boolean {
  return (
    !!process.env.VERCEL ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.AWS_EXECUTION_ENV
  );
}

export async function launchBrowser(extraArgs: string[] = []): Promise<Browser> {
  if (isServerless()) {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    const { chromium } = await import("playwright-core");
    // Niente grafica/GPU su Lambda: riduce memoria e cold start.
    sparticuz.setGraphicsMode = false;
    const executablePath = await sparticuz.executablePath();
    // ETXTBSY: due invocazioni concorrenti sulla stessa istanza (fluid compute)
    // → una sta ancora scrivendo /tmp/chromium mentre l'altra lo esegue.
    // Retry breve con backoff invece di far fallire la candidatura.
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        return (await chromium.launch({
          args: [...sparticuz.args, ...BASE_ARGS, ...extraArgs],
          executablePath,
          headless: true,
        })) as unknown as Browser;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (!/ETXTBSY|EBUSY|EAGAIN/.test(msg) || attempt === 4) throw err;
        console.warn(`[browser] launch ${msg.split("\n")[0].slice(0, 80)} → retry ${attempt}/3`);
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  // Worker Railway / dev locale: playwright completo (browser bundlati).
  // Anti-fingerprint: niente flag "AutomationControlled" (navigator.webdriver)
  // e, se configurato, proxy residenziale: reCAPTCHA Enterprise assegna
  // score bassissimi agli IP datacenter e fa scattare il "security code".
  const { chromium } = await import("playwright");
  const proxy = process.env.PROXY_SERVER
    ? { server: process.env.PROXY_SERVER, username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD }
    : undefined;
  return chromium.launch({
    headless: true,
    args: [...BASE_ARGS, "--disable-blink-features=AutomationControlled", ...extraArgs],
    proxy,
  });
}

/** UA Chrome recente e coerente col Chromium in uso (versione da env se serve aggiornarla senza deploy). */
export const HUMAN_UA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.env.BROWSER_UA_CHROME ?? "140.0.0.0"} Safari/537.36`;

/**
 * Contesto "umano": UA aggiornato, viewport reale, lingua/fuso italiani e
 * init script che nasconde i tratti tipici dell'automazione (webdriver,
 * plugins vuoti, languages). Usato per tutti i submit sui portali ATS.
 */
export async function humanContext(browser: Browser) {
  const context = await browser.newContext({
    userAgent: HUMAN_UA,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    viewport: { width: 1366, height: 820 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    extraHTTPHeaders: { "Accept-Language": "it-IT,it;q=0.9,en;q=0.7" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["it-IT", "it", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    const w = window as unknown as { chrome?: unknown };
    if (!w.chrome) w.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
    const q = window.navigator.permissions?.query?.bind(window.navigator.permissions);
    if (q) window.navigator.permissions.query = (p: PermissionDescriptor) => (p.name === "notifications" ? Promise.resolve({ state: Notification.permission } as PermissionStatus) : q(p));
  });
  return context;
}
