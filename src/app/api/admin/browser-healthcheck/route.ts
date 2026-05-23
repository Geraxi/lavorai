import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { launchBrowser } from "@/lib/browser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/admin/browser-healthcheck
 * Verifica IN PRODUZIONE che Chromium (@sparticuz/chromium su Vercel) si
 * avvii davvero e sappia caricare una pagina. Zero rischio: non invia nessuna
 * candidatura, apre solo una pagina di test. Risolve la domanda chiave
 * dell'opzione B: "il browser parte su serverless?". Admin-only.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const t0 = Date.now();
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    browser = await launchBrowser();
    const launchedMs = Date.now() - t0;
    const version = browser.version();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setContent(
      "<html><body><h1 id='t'>lavorai-browser-ok</h1></body></html>",
    );
    const text = await page.textContent("#t");
    const totalMs = Date.now() - t0;

    return NextResponse.json({
      ok: true,
      status: "browser_ok",
      message: "Chromium si avvia e renderizza correttamente su produzione.",
      chromiumVersion: version,
      domCheck: text,
      launchedMs,
      totalMs,
      env: process.env.VERCEL ? "vercel" : "other",
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      status: "browser_failed",
      message:
        "Chromium NON si avvia su Vercel. Probabile causa: binario non incluso nel bundle, memoria insufficiente, o mismatch versione playwright-core/Chromium.",
      raw: (err instanceof Error ? err.message : String(err)).slice(0, 400),
      ms: Date.now() - t0,
    });
  } finally {
    if (browser) await browser.close().catch(() => void 0);
  }
}
