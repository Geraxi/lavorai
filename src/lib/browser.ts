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
    return (await chromium.launch({
      args: [...sparticuz.args, ...BASE_ARGS, ...extraArgs],
      executablePath,
      headless: true,
    })) as unknown as Browser;
  }

  // Dev locale: playwright completo (browser bundlati).
  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: [...BASE_ARGS, ...extraArgs],
  });
}
