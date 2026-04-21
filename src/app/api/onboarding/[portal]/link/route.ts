import { NextResponse, type NextRequest } from "next/server";
import { getDemoUser, prisma } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { isPortalId, PORTALS } from "@/lib/portals";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — necessario per attendere login manuale

/**
 * Avvia un browser Playwright headed sulla macchina del server.
 * In dev (localhost) = macchina dell'utente → funziona.
 * In produzione questo va spostato in extension Chrome o desktop helper
 * (vedi roadmap Sprint 5).
 *
 * Flusso:
 *  1. Lancia Chromium headed sulla login page del portale
 *  2. Attende fino a 4 minuti che l'URL matchi il pattern post-login
 *  3. Estrae cookie di sessione, cifra, salva in DB
 *  4. Chiude il browser
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ portal: string }> },
) {
  const { portal } = await params;
  if (!isPortalId(portal)) {
    return NextResponse.json(
      { error: "invalid_portal", message: `Portale '${portal}' non supportato.` },
      { status: 400 },
    );
  }

  const cfg = PORTALS[portal];

  // Import dinamico perché playwright è grande — tenerlo fuori dal bundle
  // dei route handler che non lo usano.
  const { chromium } = await import("playwright");

  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const context = await browser.newContext({
      userAgent: cfg.defaultUserAgent,
      locale: "it-IT",
      timezoneId: "Europe/Rome",
    });
    const page = await context.newPage();

    await page.goto(cfg.loginUrl, { waitUntil: "domcontentloaded" });

    // Aspetta che l'utente logghi (max 4 min)
    await page.waitForURL(cfg.loggedInUrlPattern, { timeout: 240_000 });

    const cookies = await context.cookies();
    if (cookies.length === 0) {
      throw new Error("Nessun cookie ricevuto dal portale.");
    }

    const user = await getDemoUser();
    const encrypted = encryptJson(cookies);

    await prisma.portalSession.upsert({
      where: { userId_portal: { userId: user.id, portal: cfg.id } },
      update: {
        encryptedCookies: encrypted,
        userAgent: cfg.defaultUserAgent,
        lastValidatedAt: new Date(),
      },
      create: {
        userId: user.id,
        portal: cfg.id,
        encryptedCookies: encrypted,
        userAgent: cfg.defaultUserAgent,
      },
    });

    return NextResponse.json({ ok: true, portal: cfg.id, cookies: cookies.length });
  } catch (err) {
    console.error(`[onboarding/${portal}/link]`, err);
    const message =
      err instanceof Error && err.message.includes("Timeout")
        ? `Timeout: non abbiamo rilevato il login entro 4 minuti. Riprova e completa il login su ${cfg.label}.`
        : err instanceof Error
          ? err.message
          : "Errore durante il linking.";
    return NextResponse.json(
      { error: "link_failed", message },
      { status: 500 },
    );
  } finally {
    if (browser) await browser.close().catch(() => void 0);
  }
}
