import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";

/**
 * Greenhouse ATS — `boards.greenhouse.io/<slug>/jobs/<id>` o `job-boards.greenhouse.io/*`.
 * Form pubblico, niente login. Campi standard:
 *   - first_name, last_name, email, phone (tutti input con id/name predicibili)
 *   - resume (input[type=file] name=resume oppure aria-label "Resume/CV")
 *   - cover_letter (optional, textarea o file)
 */

const HOSTS = [
  /(^|\.)boards\.greenhouse\.io$/i,
  /(^|\.)job-boards\.greenhouse\.io$/i,
  /(^|\.)jobs\.greenhouse\.io$/i,
];

export const greenhouseAdapter: PortalAdapter = {
  id: "greenhouse",
  label: "Greenhouse",
  matches(url: string): boolean {
    try {
      const u = new URL(url);
      return HOSTS.some((re) => re.test(u.hostname));
    } catch {
      return false;
    }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
    await page.goto(input.jobUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    // Molti form Greenhouse sono embed iframe. Cerca sia in top-level che
    // nell'iframe. Saliamo sul form sull'URL /apply se presente.
    const applyLink = page.locator('a[href*="/apply"], a:has-text("Apply")');
    if ((await applyLink.count()) > 0) {
      await applyLink.first().click().catch(() => void 0);
      await page.waitForLoadState("domcontentloaded").catch(() => void 0);
    }

    // Firma di un form Greenhouse
    const firstName = page.locator(
      'input[name="first_name"], input#first_name, input[aria-label*="First" i]',
    );
    const timeout = 15_000;
    try {
      await firstName.first().waitFor({ timeout });
    } catch {
      return {
        ok: false,
        status: "form_not_found",
        error: "Form Greenhouse non rilevato entro 15s.",
      };
    }

    try {
      await firstName.first().fill(input.profile.firstName || "");
      await page
        .locator(
          'input[name="last_name"], input#last_name, input[aria-label*="Last" i]',
        )
        .first()
        .fill(input.profile.lastName || "")
        .catch(() => void 0);
      await page
        .locator('input[name="email"], input#email, input[type="email"]')
        .first()
        .fill(input.profile.email || "")
        .catch(() => void 0);
      if (input.profile.phone) {
        await page
          .locator(
            'input[name="phone"], input#phone, input[type="tel"], input[aria-label*="Phone" i]',
          )
          .first()
          .fill(input.profile.phone)
          .catch(() => void 0);
      }

      // Upload CV
      const cvInput = page.locator(
        'input[type="file"][name*="resume" i], input[type="file"][aria-label*="resume" i], input[type="file"]#resume, input[type="file"]',
      );
      if ((await cvInput.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Input upload CV non trovato.",
        };
      }
      await cvInput.first().setInputFiles(input.cvLocalPath);

      // Cover letter (textarea o file — opzionale)
      const clTextarea = page.locator(
        'textarea[name*="cover" i], textarea[aria-label*="cover" i]',
      );
      if ((await clTextarea.count()) > 0) {
        await clTextarea.first().fill(input.coverLetterText).catch(() => void 0);
      } else {
        const clFile = page.locator(
          'input[type="file"][name*="cover" i], input[type="file"][aria-label*="cover" i]',
        );
        if ((await clFile.count()) > 0) {
          await clFile.first().setInputFiles(input.clLocalPath).catch(() => void 0);
        }
      }

      // GDPR/consenso + accetta termini (best-effort)
      for (const sel of [
        'input[type="checkbox"][name*="privacy" i]',
        'input[type="checkbox"][name*="gdpr" i]',
        'input[type="checkbox"][name*="consent" i]',
        'input[type="checkbox"][id*="privacy" i]',
      ]) {
        const cb = page.locator(sel);
        if ((await cb.count()) > 0) {
          await cb
            .first()
            .check({ timeout: 1500 })
            .catch(() => void 0);
        }
      }

      if (input.dryRun) {
        return { ok: true, status: "submitted", confirmation: "DRY_RUN" };
      }

      const submit = page.locator(
        'button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply"), button:has-text("Invia")',
      );
      if ((await submit.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Bottone submit non trovato.",
        };
      }
      await submit.first().click();
      // Se il click non ha buttato eccezioni, assumiamo submit riuscito.
      // Aspettiamo brevemente per dare tempo alla navigazione.
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => void 0);
      const url = page.url();
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const confirmed =
        /confirm|thank|successo|grazie|submitted|applied|received|invi(at|o)|conferma/i.test(bodyText) ||
        /confirm|thank/i.test(url);
      return {
        ok: true,
        status: "submitted",
        confirmation: confirmed ? "DETECTED" : "UNCONFIRMED",
      };
    } catch (err) {
      return {
        ok: false,
        status: "unknown_error",
        error: err instanceof Error ? err.message : "Errore imprevisto Greenhouse",
      };
    }
  },
};
