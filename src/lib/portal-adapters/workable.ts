import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";

/**
 * Workable ATS — `apply.workable.com/<slug>/j/<id>/apply` oppure
 * `<slug>.workable.com`. Form pubblico senza login.
 * Campi: firstname, lastname, email, phone, resume upload, headline.
 */

const HOSTS = [
  /(^|\.)workable\.com$/i,
];

export const workableAdapter: PortalAdapter = {
  id: "workable",
  label: "Workable",
  matches(url: string): boolean {
    try {
      const u = new URL(url);
      return HOSTS.some((re) => re.test(u.hostname));
    } catch {
      return false;
    }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
    const applyUrl = input.jobUrl.includes("/apply")
      ? input.jobUrl
      : input.jobUrl.replace(/\/?$/, "/apply");

    await page.goto(applyUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    try {
      await page
        .locator(
          'input[name="firstname"], input#firstname, input[aria-label*="First" i]',
        )
        .first()
        .waitFor({ timeout: 15_000 });
    } catch {
      return {
        ok: false,
        status: "form_not_found",
        error: "Form Workable non rilevato.",
      };
    }

    try {
      await page
        .locator('input[name="firstname"], input#firstname')
        .first()
        .fill(input.profile.firstName || "")
        .catch(() => void 0);
      await page
        .locator('input[name="lastname"], input#lastname')
        .first()
        .fill(input.profile.lastName || "")
        .catch(() => void 0);
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
      if (input.profile.title) {
        await page
          .locator(
            'input[name="headline"], input[aria-label*="Headline" i], input[aria-label*="Titolo" i]',
          )
          .first()
          .fill(input.profile.title)
          .catch(() => void 0);
      }

      // Upload CV
      const cvInput = page.locator(
        'input[type="file"][name*="resume" i], input[type="file"][aria-label*="resume" i], input[type="file"][aria-label*="CV" i], input[type="file"]',
      );
      if ((await cvInput.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Input upload CV non trovato (Workable).",
        };
      }
      await cvInput.first().setInputFiles(input.cvLocalPath);

      // Cover letter textarea
      const clTextarea = page.locator(
        'textarea[name*="cover" i], textarea[aria-label*="cover" i], textarea[aria-label*="Lettera" i]',
      );
      if ((await clTextarea.count()) > 0) {
        await clTextarea.first().fill(input.coverLetterText).catch(() => void 0);
      }

      // GDPR
      const consent = page.locator(
        'input[type="checkbox"][name*="gdpr" i], input[type="checkbox"][name*="consent" i], input[type="checkbox"][name*="privacy" i]',
      );
      const cnt = await consent.count();
      for (let i = 0; i < cnt; i++) {
        await consent
          .nth(i)
          .check({ timeout: 1500 })
          .catch(() => void 0);
      }

      if (input.dryRun) {
        return { ok: true, status: "submitted", confirmation: "DRY_RUN" };
      }

      const submit = page.locator(
        'button[type="submit"], button:has-text("Submit"), button:has-text("Apply"), button:has-text("Invia")',
      );
      if ((await submit.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Bottone submit Workable non trovato.",
        };
      }
      await submit.first().click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => void 0);
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const confirmed =
        /thank|applied|submitted|grazie|received|confirm|invi(at|o)/i.test(bodyText) ||
        /thanks|confirm/i.test(page.url());
      return {
        ok: true,
        status: "submitted",
        confirmation: confirmed ? "DETECTED" : "UNCONFIRMED",
      };
    } catch (err) {
      return {
        ok: false,
        status: "unknown_error",
        error: err instanceof Error ? err.message : "Errore imprevisto Workable",
      };
    }
  },
};
