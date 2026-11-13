import { observeSubmission } from "./submission-proof";
import { findSubmitButton } from "./submit-button";
import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
import { abortIfFieldsWrong, inspectLivePage } from "./page-guards";
import { fillPhoneCountryCode } from "./phone-country-fill";
import { detectBlockingCaptcha } from "./captcha";

/**
 * Lever ATS — `jobs.lever.co/<company>/<uuid>`.
 * Form pubblico; apply button porta a `<url>/apply`.
 * Campi: name (unico input), email, phone, resume upload, LinkedIn URL.
 *
 * The posting page often has no inputs; `/apply` SSRs the full form
 * (name/email/resume). Prefer `/apply`, wait for hydration, and treat
 * interactive challenges as captcha rather than form_not_found.
 */

const HOSTS = [/(^|\.)jobs\.lever\.co$/i, /(^|\.)jobs\.eu\.lever\.co$/i];

const FORM_INPUT = 'input[name="name"], input[data-qa="name-input"], input[name="email"], input[name="resume"]';

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
    const base = input.jobUrl.replace(/\/$/, "").replace(/\/apply$/i, "");
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

      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => void 0);
      await page.waitForTimeout(800);

      const finalHost = (() => {
        try {
          return new URL(page.url()).hostname.toLowerCase();
        } catch {
          return "";
        }
      })();
      if (!finalHost.includes("lever.co")) continue;

      const captchaEarly = await detectBlockingCaptcha(page);
      if (captchaEarly.blocking) {
        return {
          ok: false,
          status: "captcha",
          error: `Form Lever protetto da captcha interattivo (${captchaEarly.kind}). Nessun invio automatico.`,
        };
      }

      // Posting page: click Apply to reach the form when /apply was not used.
      const applyBtn = page.locator(
        'a.postings-btn:has-text("Apply"), a[href$="/apply"], button:has-text("Apply for this job"), a:has-text("Apply for this job")',
      ).first();
      if ((await applyBtn.count().catch(() => 0)) > 0 && (await applyBtn.isVisible().catch(() => false))) {
        await applyBtn.click({ timeout: 4000 }).catch(() => void 0);
        await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => void 0);
        await page.waitForTimeout(800);
      }

      try {
        await page.locator(FORM_INPUT).first().waitFor({ timeout: 12_000 });
        formFound = true;
        break;
      } catch {
        // try next URL
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
      await page.locator('input[name="name"], input[data-qa="name-input"]').first().fill(fullName);
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
      await fillPhoneCountryCode(page, phoneToUse, input.answers?.country);

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

      const clTextarea = page.locator(
        'textarea[name*="cover" i], textarea[name="comments"]',
      );
      if ((await clTextarea.count()) > 0) {
        await clTextarea.first().fill(input.coverLetterText).catch(() => void 0);
      }

      try {
        const { fillCustomQuestions } = await import("./generic-fill");
        const { buildAnswerContext } = await import("./web-form");
        const r = await fillCustomQuestions(page, input.answers, { context: buildAnswerContext(input) });
        if (r.filled > 0) {
          console.log(
            `[lever] custom questions filled: ${r.filled} (${r.matched.slice(0, 4).join(", ")})`,
          );
        }
      } catch (err) {
        console.warn("[lever] generic-fill failed", err);
      }

      const { prepareRequiredAnswers } = await import("./web-form");
      const unanswered = await prepareRequiredAnswers(page, input);
      if (unanswered) return unanswered;
      const guarded = await inspectLivePage(page);
      if (guarded) return guarded;
      const wrong = await abortIfFieldsWrong(page, input);
      if (wrong) return wrong;
      if (input.dryRun) {
        return { ok: true, status: "submitted", confirmation: "DRY_RUN" };
      }

      const captcha = await detectBlockingCaptcha(page);
      if (captcha.blocking) {
        return {
          ok: false,
          status: "captcha",
          error:
            "Form Lever protetto da captcha interattivo — submit automatico bloccato. Apri l'annuncio e candidati manualmente.",
        };
      }

      const hcaptcha = await page
        .locator('iframe[src*="hcaptcha"], div[class*="h-captcha"], #hcaptchaSubmitBtn')
        .count()
        .catch(() => 0);
      if (hcaptcha > 0) {
        return {
          ok: false,
          status: "captcha",
          error:
            "Form Lever protetto da hCaptcha — submit automatico bloccato. Apri l'annuncio e candidati manualmente.",
        };
      }

      const submit = await findSubmitButton(page);
      if (!submit) {
        return {
          ok: false,
          status: "missing_field",
          error: "Bottone submit visibile non trovato (Lever).",
        };
      }
      return (await observeSubmission(page, "lever", input.jobUrl,
        () => submit.click({ timeout: 5_000 }), input.beforeSubmit, { applicationId: input.applicationId })).outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore imprevisto Lever";
      if (/Target page, context or browser has been closed|browser has been closed/i.test(message)) {
        return { ok: false, status: "unknown_error", error: message };
      }
      return {
        ok: false,
        status: "unknown_error",
        error: message,
      };
    }
  },
};
