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
    const applyUrl = input.jobUrl.endsWith("/apply")
      ? input.jobUrl
      : `${input.jobUrl.replace(/\/$/, "")}/apply`;

    await page.goto(applyUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    try {
      await page.locator('input[name="name"]').first().waitFor({ timeout: 15_000 });
    } catch {
      return {
        ok: false,
        status: "form_not_found",
        error: "Form Lever non rilevato.",
      };
    }

    const fullName = [input.profile.firstName, input.profile.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    try {
      await page.locator('input[name="name"]').first().fill(fullName);
      await page
        .locator('input[name="email"], input[type="email"]')
        .first()
        .fill(input.profile.email || "")
        .catch(() => void 0);
      if (input.profile.phone) {
        await page
          .locator('input[name="phone"], input[type="tel"]')
          .first()
          .fill(input.profile.phone)
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
        /thank|successful|submitted|grazie|received|confirm/i.test(bodyText) ||
        /thanks|confirmation/i.test(page.url());
      if (!confirmed) {
        return {
          ok: false,
          status: "unknown_error",
          error: "Submit Lever: conferma non rilevata.",
        };
      }
      return { ok: true, status: "submitted" };
    } catch (err) {
      return {
        ok: false,
        status: "unknown_error",
        error: err instanceof Error ? err.message : "Errore imprevisto Lever",
      };
    }
  },
};
