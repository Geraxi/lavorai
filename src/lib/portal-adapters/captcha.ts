import type { Page } from "playwright";

/**
 * Captcha detection. Only interactive widgets a human would have to solve
 * (visible reCAPTCHA challenge or checkbox, hCaptcha, Turnstile, "I'm not
 * a robot") are blocking; we never solve or bypass them. The invisible /
 * score-based reCAPTCHA badge (Greenhouse enterprise.js?render=) is
 * reported (kind) but is not blocking.
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
    // 1) Challenge reCAPTCHA aperta (immagini / bframe) → bloccante.
    if (await vis('iframe[src*="recaptcha"][src*="bframe"], iframe[src*="recaptcha"][src*="challenge"]')) {
      return { blocking: true, kind: "recaptcha_challenge", detail: "challenge reCAPTCHA visibile" };
    }

    // 2) Checkbox reCAPTCHA v2 esplicito: widget .g-recaptcha (non invisible)
    //    con anchor visibile, o il testo "I'm not a robot". The 256×60
    //    enterprise badge iframe (title=reCAPTCHA, no .g-recaptcha wrapper)
    //    is NOT a checkbox.
    if (await vis('.g-recaptcha:not([data-size="invisible"]) iframe[src*="recaptcha"][src*="anchor"]')
      || await vis("text=/I.?m not a robot|Non sono un robot/i")) {
      return { blocking: true, kind: "recaptcha_checkbox", detail: "checkbox reCAPTCHA v2 visibile" };
    }

    // 3) hCaptcha / Turnstile visibili: se il widget si vede, serve l'utente.
    if (await vis('iframe[src*="hcaptcha"], .h-captcha, [class*="hcaptcha"]')) {
      return { blocking: true, kind: "hcaptcha", detail: "widget hCaptcha visibile" };
    }
    if (await vis('iframe[src*="turnstile"], .cf-turnstile, [class*="cf-turnstile"]')) {
      return { blocking: true, kind: "turnstile", detail: "widget Turnstile visibile" };
    }

    // 4) Invisible / score-based reCAPTCHA (badge, data-size=invisible,
    //    enterprise.js?render=): present on virtually every Greenhouse and
    //    Ashby form. It shows no challenge and the token is minted at
    //    submit, so it is NOT blocking (same rule as dd3a94a). If Google
    //    escalates, a visible bframe appears after the click and check (1)
    //    catches it; a server-side rejection is caught by the receipt
    //    verifier. We never solve or bypass anything.
    const invisibleWidget = (await page.locator('.g-recaptcha[data-size="invisible"]').count().catch(() => 0)) > 0;
    const badge = (await page.locator(".grecaptcha-badge").count().catch(() => 0)) > 0;
    if (invisibleWidget || badge) {
      return {
        blocking: false,
        kind: badge ? "recaptcha_invisible_badge" : "recaptcha_invisible",
        detail: "reCAPTCHA invisibile (non interattivo): nessuna challenge visibile",
      };
    }
    return { blocking: false, kind: null, detail: "nessun captcha" };
  } catch (err) {
    return { blocking: false, kind: null, detail: `check fallito: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * After Submit: only a visible interactive challenge that is actually on
 * the page counts. The badge stays on a successful Greenhouse POST and
 * must not mask a receipt. hCaptcha / Turnstile / checkbox / bframe that
 * appear after the click still block.
 */
export async function challengeAppearedAfterSubmit(page: Page): Promise<boolean> {
  const r = await detectBlockingCaptcha(page);
  return r.blocking;
}
