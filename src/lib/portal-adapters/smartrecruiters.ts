import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";

/**
 * SmartRecruiters ATS — `jobs.smartrecruiters.com/<company>/<jobId>` o
 * `careers.smartrecruiters.com/<company>/<jobId>`.
 * Form pubblico, no login. Stack moderno (Vue/React) — selettori basati
 * su data-testid o name. La job page ha un bottone "I'm interested" che
 * apre il form. Esiste anche `<url>/apply` come URL diretto in alcuni
 * setup.
 *
 * Campi: firstName, lastName, email, phone, resume upload, GDPR consent.
 */

const HOSTS = [
  /(^|\.)smartrecruiters\.com$/i,
  /(^|\.)jobs\.smartrecruiters\.com$/i,
  /(^|\.)careers\.smartrecruiters\.com$/i,
];

export const smartrecruitersAdapter: PortalAdapter = {
  id: "smartrecruiters",
  label: "SmartRecruiters",
  matches(url: string): boolean {
    try {
      const u = new URL(url);
      return HOSTS.some((re) => re.test(u.hostname));
    } catch {
      return false;
    }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
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

      const finalHost = (() => {
        try {
          return new URL(page.url()).hostname.toLowerCase();
        } catch {
          return "";
        }
      })();
      if (!finalHost.includes("smartrecruiters.com")) continue;

      // Job page → click "I'm interested" / "Apply Now" per aprire il form
      const interestedBtn = page.locator(
        'button:has-text("I\'m interested"), a:has-text("I\'m interested"), button:has-text("Apply"), a:has-text("Apply Now"), button:has-text("Mi interessa")',
      );
      if ((await interestedBtn.count()) > 0) {
        await interestedBtn
          .first()
          .click({ timeout: 2_000 })
          .catch(() => void 0);
        await page.waitForTimeout(800);
      }

      try {
        await page
          .locator(
            'input[name="firstName"], input[id*="firstName" i], input[placeholder*="First name" i], input[name="lastName"]',
          )
          .first()
          .waitFor({ timeout: 8_000 });
        formFound = true;
        break;
      } catch {
        // niente
      }
    }

    if (!formFound) {
      return {
        ok: false,
        status: "form_not_found",
        error: `Form SmartRecruiters non rilevato (provati ${candidates.length} URL, ultimo: ${lastTriedUrl}).`,
      };
    }

    try {
      const emailToUse = input.profile.email?.trim() || input.userEmail;
      const phoneToUse = input.profile.phone?.trim() || input.userPhone;

      await page
        .locator(
          'input[name="firstName"], input[id*="firstName" i], input[placeholder*="First name" i]',
        )
        .first()
        .fill(input.profile.firstName || "")
        .catch(() => void 0);

      await page
        .locator(
          'input[name="lastName"], input[id*="lastName" i], input[placeholder*="Last name" i]',
        )
        .first()
        .fill(input.profile.lastName || "")
        .catch(() => void 0);

      await page
        .locator('input[name="email"], input[type="email"]')
        .first()
        .fill(emailToUse)
        .catch(() => void 0);

      if (phoneToUse) {
        await page
          .locator(
            'input[name="phoneNumber"], input[name*="phone" i], input[type="tel"]',
          )
          .first()
          .fill(phoneToUse)
          .catch(() => void 0);
      }

      // Upload CV
      const cvInput = page.locator(
        'input[type="file"][name*="resume" i], input[type="file"][name*="cv" i], input[type="file"]',
      );
      if ((await cvInput.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Input upload CV non trovato (SmartRecruiters).",
        };
      }
      await cvInput.first().setInputFiles(input.cvLocalPath);

      // LinkedIn URL field se presente
      const li = input.profile.links?.find((l) => /linkedin/i.test(l.url));
      if (li) {
        await page
          .locator(
            'input[name*="linkedin" i], input[placeholder*="LinkedIn" i]',
          )
          .first()
          .fill(li.url)
          .catch(() => void 0);
      }

      // Cover letter
      const clTextarea = page.locator(
        'textarea[name*="cover" i], textarea[name*="message" i], textarea[placeholder*="cover" i]',
      );
      if ((await clTextarea.count()) > 0) {
        await clTextarea.first().fill(input.coverLetterText).catch(() => void 0);
      }

      // Custom questions
      try {
        const { fillCustomQuestions } = await import("./generic-fill");
        const r = await fillCustomQuestions(page, input.answers);
        if (r.filled > 0) {
          console.log(
            `[smartrecruiters] custom questions filled: ${r.filled} (${r.matched.slice(0, 4).join(", ")})`,
          );
        }
      } catch (err) {
        console.warn("[smartrecruiters] generic-fill failed", err);
      }

      // GDPR — SmartRecruiters spesso richiede consent EU obbligatorio
      const consent = page.locator(
        'input[type="checkbox"][name*="consent" i], input[type="checkbox"][name*="gdpr" i], input[type="checkbox"][name*="privacy" i], input[type="checkbox"][name*="terms" i]',
      );
      const cnt = await consent.count();
      for (let i = 0; i < cnt; i++) {
        await consent.nth(i).check({ timeout: 1500 }).catch(() => void 0);
      }

      if (input.dryRun) {
        return { ok: true, status: "submitted", confirmation: "DRY_RUN" };
      }

      // reCAPTCHA detection — SmartRecruiters lo usa su alcuni form
      const recaptcha = await page
        .locator('iframe[src*="recaptcha"], div[class*="g-recaptcha"]')
        .count()
        .catch(() => 0);
      if (recaptcha > 0) {
        return {
          ok: false,
          status: "captcha",
          error:
            "Form SmartRecruiters protetto da reCAPTCHA — submit automatico bloccato.",
        };
      }

      const submit = page.locator(
        'button[type="submit"]:visible, button:visible:has-text("Submit"), button:visible:has-text("Apply"), button:visible:has-text("Send application"), button:visible:has-text("Invia")',
      );
      if ((await submit.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Bottone submit SmartRecruiters non trovato.",
        };
      }
      await submit.first().click({ timeout: 5_000 });
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => void 0);
      const bodyText = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      const confirmed =
        /thank|applied|submitted|grazie|received|confirm|successfully/i.test(
          bodyText,
        ) || /thanks|confirm|success/i.test(page.url());
      return {
        ok: true,
        status: "submitted",
        confirmation: confirmed ? "DETECTED" : "UNCONFIRMED",
      };
    } catch (err) {
      return {
        ok: false,
        status: "unknown_error",
        error:
          err instanceof Error
            ? err.message
            : "Errore imprevisto SmartRecruiters",
      };
    }
  },
};
