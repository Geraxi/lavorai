import type { Page } from "playwright";

/**
 * Rilevamento captcha "onesto": distingue un captcha INTERATTIVO (checkbox
 * reCAPTCHA v2, hCaptcha, Turnstile visibile, challenge aperta) — che blocca
 * davvero l'invio automatico — dal badge reCAPTCHA INVISIBILE (v3 / v2
 * invisible / enterprise) che quasi tutti i form Greenhouse e Ashby hanno e
 * che NON richiede alcuna interazione: il token viene generato al click su
 * Invia.
 *
 * Bug storico: `.grecaptcha-badge` / `iframe[src*="recaptcha"]` + textarea
 * `g-recaptcha-response` vuota venivano letti come "captcha non risolto" →
 * ogni candidatura ATS si fermava PRIMA del submit → zero DETECTED_* in prod
 * (riprodotto in locale su Stripe/Greenhouse e Linear/Ashby: solo badge,
 * 256×60, anchor invisibile).
 *
 * Implementazione con locator Playwright (niente funzioni interne dentro
 * page.evaluate: con tsx/esbuild `keepNames` iniettano `__name(...)` che nel
 * browser non esiste e fa fallire l'evaluate silenziosamente).
 */
export async function detectBlockingCaptcha(page: Page): Promise<{
  blocking: boolean;
  kind: string | null;
  detail: string;
}> {
  const vis = async (selector: string): Promise<boolean> => {
    const loc = page.locator(selector);
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      if (await loc.nth(i).isVisible().catch(() => false)) return true;
    }
    return false;
  };

  try {
    // 1) Challenge reCAPTCHA aperta (immagini) → bloccante.
    if (await vis('iframe[src*="recaptcha"][src*="bframe"]')) {
      return { blocking: true, kind: "recaptcha_challenge", detail: "challenge reCAPTCHA visibile" };
    }

    // 2) Checkbox reCAPTCHA v2 esplicito: widget .g-recaptcha (non invisible)
    //    con anchor visibile. Il badge (.grecaptcha-badge) non è un .g-recaptcha.
    if (await vis('.g-recaptcha:not([data-size="invisible"]) iframe[src*="recaptcha"][src*="anchor"]')) {
      return { blocking: true, kind: "recaptcha_checkbox", detail: "checkbox reCAPTCHA v2 visibile" };
    }

    // 3) hCaptcha / Turnstile visibili: se il widget si vede, serve l'utente.
    if (await vis('iframe[src*="hcaptcha"], .h-captcha, [class*="hcaptcha"]')) {
      return { blocking: true, kind: "hcaptcha", detail: "widget hCaptcha visibile" };
    }
    if (await vis('iframe[src*="turnstile"], .cf-turnstile, [class*="cf-turnstile"]')) {
      return { blocking: true, kind: "turnstile", detail: "widget Turnstile visibile" };
    }

    // 4) Solo badge invisibile (o niente) → NON bloccante.
    const badge = (await page.locator(".grecaptcha-badge").count().catch(() => 0)) > 0;
    return {
      blocking: false,
      kind: badge ? "recaptcha_invisible_badge" : null,
      detail: badge ? "solo badge reCAPTCHA invisibile: il token viene generato al submit" : "nessun captcha",
    };
  } catch (err) {
    return { blocking: false, kind: null, detail: `check fallito: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Dopo il click su Invia: se non è partita nessuna POST e nel frattempo si è
 * aperta una challenge reCAPTCHA (immagini) → il captcha ha bloccato davvero.
 */
export async function challengeAppearedAfterSubmit(page: Page): Promise<boolean> {
  const r = await detectBlockingCaptcha(page);
  return r.blocking && r.kind === "recaptcha_challenge";
}
