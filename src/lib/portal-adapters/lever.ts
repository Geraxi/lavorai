import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";

/**
 * Lever ATS — `jobs.lever.co/<company>/<uuid>`.
 * Form pubblico; apply button porta a `<url>/apply`.
 * Campi: name (unico input), email, phone, resume upload, LinkedIn URL.
 */

const HOSTS = [/(^|\.)jobs\.lever\.co$/i, /(^|\.)jobs\.eu\.lever\.co$/i];

export const leverAdapter: PortalAdapter = {
  id: "lever",
  label: "Lever",
  matches(url: string): boolean {
    try {
      const u = new URL(url);
      return HOSTS.some((re) => re.test(u.hostname));
    } catch {
      return false;
    }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
    // Provo sia /apply (form puro) sia URL nudo. Le aziende moderne
    // possono redirezionare il base URL alla loro career page custom,
    // ma /apply resta sul dominio Lever in molti setup.
    const base = input.jobUrl.replace(/\/$/, "").replace(/\/apply$/, "");
    const candidates = [`${base}/apply`, base];

    let formFound = false;
    let lastTriedUrl = "";
    for (const tryUrl of candidates) {
      lastTriedUrl = tryUrl;
      try {
        await page.goto(tryUrl, {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        });
      } catch {
        continue;
      }
      // Verifica che siamo ancora su Lever (no redirect career page custom)
      const finalHost = (() => {
        try {
          return new URL(page.url()).hostname.toLowerCase();
        } catch {
          return "";
        }
      })();
      if (!finalHost.includes("lever.co")) continue;

      // Lever ha 2-3 form layout: signature input "name" sempre presente
      try {
        await page
          .locator(
            'input[name="name"], input[name="firstName"], input[name="resume"]',
          )
          .first()
          .waitFor({ timeout: 8_000 });
        formFound = true;
        break;
      } catch {
        // niente form qui, prossimo
      }
    }

    if (!formFound) {
      return {
        ok: false,
        status: "form_not_found",
        error: `Form Lever non rilevato (provati ${candidates.length} URL, ultimo: ${lastTriedUrl}). Probabile career page custom dell'azienda.`,
      };
    }

    const fullName = [input.profile.firstName, input.profile.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    try {
      const emailToUse = input.profile.email?.trim() || input.userEmail;
      const phoneToUse = input.profile.phone?.trim() || input.userPhone;
      await page.locator('input[name="name"]').first().fill(fullName);
      await page
        .locator('input[name="email"], input[type="email"]')
        .first()
        .fill(emailToUse)
        .catch(() => void 0);
      if (phoneToUse) {
        await page
          .locator('input[name="phone"], input[type="tel"]')
          .first()
          .fill(phoneToUse)
          .catch(() => void 0);
      }

      // LinkedIn URL se disponibile
      const li = input.profile.links?.find((l) =>
        /linkedin/i.test(l.url),
      );
      if (li) {
        await page
          .locator(
            'input[name*="urls" i][name*="linkedin" i], input[name="urls[LinkedIn]"], input[placeholder*="LinkedIn" i]',
          )
          .first()
          .fill(li.url)
          .catch(() => void 0);
      }

      // Upload CV — Lever usa input[name="resume"]
      const cvInput = page.locator(
        'input[type="file"][name="resume"], input[type="file"][name*="resume" i], input[type="file"]',
      );
      if ((await cvInput.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Input upload CV non trovato (Lever).",
        };
      }
      await cvInput.first().setInputFiles(input.cvLocalPath);

      // Cover letter textarea se c'è
      const clTextarea = page.locator(
        'textarea[name*="cover" i], textarea[name="comments"]',
      );
      if ((await clTextarea.count()) > 0) {
        await clTextarea.first().fill(input.coverLetterText).catch(() => void 0);
      }

      // Fill custom questions usando le risposte standard dell'utente
      try {
        const { fillCustomQuestions } = await import("./generic-fill");
        const r = await fillCustomQuestions(page, input.answers);
        if (r.filled > 0) {
          console.log(
            `[lever] custom questions filled: ${r.filled} (${r.matched.slice(0, 4).join(", ")})`,
          );
        }
      } catch (err) {
        console.warn("[lever] generic-fill failed", err);
      }

      // Consenso privacy
      const consent = page.locator(
        'input[type="checkbox"][name*="consent" i], input[type="checkbox"][name*="gdpr" i], input[type="checkbox"][name*="privacy" i]',
      );
      if ((await consent.count()) > 0) {
        await consent
          .first()
          .check({ timeout: 1500 })
          .catch(() => void 0);
      }

      if (input.dryRun) {
        return { ok: true, status: "submitted", confirmation: "DRY_RUN" };
      }

      const submit = page.locator(
        'button[type="submit"], button:has-text("Submit"), button:has-text("Apply"), button:has-text("Invia"), input[type="submit"]',
      );
      if ((await submit.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Bottone submit non trovato (Lever).",
        };
      }
      await submit.first().click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => void 0);
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const confirmed =
        /thank|successful|submitted|grazie|received|confirm|applied|invi(at|o)/i.test(bodyText) ||
        /thanks|confirmation/i.test(page.url());
      return {
        ok: true,
        status: "submitted",
        confirmation: confirmed ? "DETECTED" : "UNCONFIRMED",
      };
    } catch (err) {
      return {
        ok: false,
        status: "unknown_error",
        error: err instanceof Error ? err.message : "Errore imprevisto Lever",
      };
    }
  },
};
