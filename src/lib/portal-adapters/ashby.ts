import { observeSubmission } from "./submission-proof";
import { findSubmitButton } from "./submit-button";
import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
import { detectBlockingCaptcha } from "./captcha";
import { ashbyContactFromProfile } from "./ashby-contact";
import { abortIfFieldsWrong, inspectLivePage } from "./page-guards";
import { fillPhoneCountryCode } from "./phone-country-fill";

/**
 * Ashby ATS — `jobs.ashbyhq.com/<company>/<uuid>`.
 * Form pubblico, no login. Stack moderno (React) — selettori basati su
 * label/aria-label perché i name attributes sono spesso UUID generati.
 *
 * Campi standard: First name, Last name, Email, Resume upload, LinkedIn URL,
 * eventuali domande custom in fondo.
 *
 * Il bottone "Apply" sulla job page apre il form inline (stessa URL) o
 * naviga su `<url>/application`. Proviamo entrambi.
 */

const HOSTS = [/(^|\.)ashbyhq\.com$/i, /(^|\.)jobs\.ashbyhq\.com$/i];

export const ashbyAdapter: PortalAdapter = {
  id: "ashby",
  label: "Ashby",
  matches(url: string): boolean {
    try {
      const u = new URL(url);
      return HOSTS.some((re) => re.test(u.hostname));
    } catch {
      return false;
    }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
    const base = input.jobUrl.replace(/\/$/, "").replace(/\/application$/, "");
    const candidates = [`${base}/application`, base];

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
      if (!finalHost.includes("ashbyhq.com")) continue;

      // Se siamo sulla job page e c'è un bottone "Apply for this job",
      // cliccalo per espandere il form.
      const applyBtn = page.locator(
        'button:has-text("Apply"), a:has-text("Apply for this Job"), a:has-text("Apply Now")',
      );
      if ((await applyBtn.count()) > 0) {
        await applyBtn.first().click({ timeout: 2_000 }).catch(() => void 0);
        await page.waitForTimeout(500);
      }

      try {
        await page
          .locator(
            'input[aria-label*="First name" i], input[aria-label*="Name" i], input[name="_systemfield_name"]',
          )
          .first()
          .waitFor({ timeout: 15_000 });
        formFound = true;
        break;
      } catch {
        // Niente form: annuncio chiuso? Ashby risponde 200 con "Job not found" (SPA,
        // renderizzato in ritardo: lo controlliamo qui, dopo l'attesa del form).
        const notFound = await page
          .locator("text=/job not found|the job you requested was not found/i")
          .count()
          .catch(() => 0);
        if (notFound > 0) {
          return { ok: false, status: "job_closed", error: "Annuncio Ashby non più online (Job not found)." };
        }
        // altrimenti prossimo tentativo
      }
    }

    if (!formFound) {
      return {
        ok: false,
        status: "form_not_found",
        error: `Form Ashby non rilevato (provati ${candidates.length} URL, ultimo: ${lastTriedUrl}).`,
      };
    }

    try {
      // Resumable blank-form pause (same contract as Greenhouse): inspect the
      // required custom questions BEFORE any fill or CV upload. Ashby uploads
      // the CV to its API as soon as the file is attached.
      if (input.onPreTransmissionPause) {
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => void 0);
        const { blankFormPause } = await import("./blank-form-pause");
        const stop = await blankFormPause(page, input, "Ashby");
        if (stop) return stop;
      }
      const contact = ashbyContactFromProfile({
        profile: input.profile,
        userName: input.userName,
        userPhone: input.userPhone,
        linkedinUrl: input.answers?.linkedinUrl,
      });
      const emailToUse = input.profile.email?.trim() || input.userEmail;

      // Ashby usa un singolo "Name" o due field separati. Provo entrambi.
      const nameField = page.locator(
        'input[name="_systemfield_name"], input[aria-label*="Full name" i], input[aria-label="Name" i], input[placeholder*="Full name" i]',
      );
      if ((await nameField.count()) > 0 && contact.fullName) {
        await nameField.first().fill(contact.fullName).catch(() => void 0);
      } else {
        await page
          .locator('input[aria-label*="First name" i]')
          .first()
          .fill(contact.firstName)
          .catch(() => void 0);
        await page
          .locator('input[aria-label*="Last name" i]')
          .first()
          .fill(contact.lastName)
          .catch(() => void 0);
      }

      await page
        .locator(
          'input[name="_systemfield_email"], input[type="email"], input[aria-label*="Email" i]',
        )
        .first()
        .fill(emailToUse)
        .catch(() => void 0);

      if (contact.phone) {
        await page
          .locator(
            'input[type="tel"], input[aria-label*="Phone" i], input[name*="phone" i]',
          )
          .first()
          .fill(contact.phone)
          .catch(() => void 0);
      }
      await fillPhoneCountryCode(page, contact.phone, input.answers?.country);

      if (contact.linkedinUrl) {
        await page
          .locator(
            'input[aria-label*="LinkedIn" i], input[placeholder*="linkedin" i], input[name*="linkedin" i]',
          )
          .first()
          .fill(contact.linkedinUrl)
          .catch(() => void 0);
      }

      // Upload CV — Ashby usa input[type="file"] (spesso hidden, dietro un
      // bottone "Attach" o "Upload Resume"). L'upload è ASINCRONO verso l'API
      // Ashby: dobbiamo VERIFICARE che il file risulti attaccato prima di
      // inviare, altrimenti finiremmo per inviare una candidatura senza CV.
      const cvInput = page.locator('input[type="file"]');
      if ((await cvInput.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Input upload CV non trovato (Ashby).",
        };
      }
      const cvBase = input.cvLocalPath.split(/[\\/]/).pop() || "cv";
      const verifyCvAttached = async (): Promise<boolean> => {
        for (let i = 0; i < 12; i++) {
          await page.waitForTimeout(400);
          const ok = await page
            .evaluate((name) => {
              try {
                const inputs = document.querySelectorAll<HTMLInputElement>(
                  'input[type="file"]',
                );
                for (const inp of Array.from(inputs)) {
                  if (inp.files && inp.files.length > 0) return true;
                }
                const body = (document.body.innerText || "").toLowerCase();
                if (name && body.includes(name.toLowerCase())) return true;
                const ind = document.querySelector(
                  "[class*='chosen'], [class*='file-name'], [class*='filename'], [class*='attachment'], [class*='uploaded']",
                );
                return !!(ind && (ind.textContent || "").trim());
              } catch {
                return false;
              }
            }, cvBase)
            .catch(() => false);
          if (ok) return true;
        }
        return false;
      };
      let cvAttached = false;
      for (let attempt = 0; attempt < 2 && !cvAttached; attempt++) {
        await cvInput.first().setInputFiles(input.cvLocalPath).catch(() => void 0);
        if (await verifyCvAttached()) {
          cvAttached = true;
          break;
        }
        await page.waitForTimeout(600);
      }
      if (!cvAttached) {
        return {
          ok: false,
          status: "missing_field",
          error:
            "CV non attaccato al form Ashby (upload non registrato). Submission abortita per non inviare candidatura vuota.",
        };
      }

      // Custom questions
      try {
        const { fillCustomQuestions } = await import("./generic-fill");
        const { buildAnswerContext } = await import("./web-form");
        const r = await fillCustomQuestions(page, input.answers, { context: buildAnswerContext(input) });
        if (r.filled > 0) {
          console.log(
            `[ashby] custom questions filled: ${r.filled} (${r.matched.slice(0, 4).join(", ")})`,
          );
        }
      } catch (err) {
        console.warn("[ashby] generic-fill failed", err);
      }

      // Required consents and declarations need explicit user answers.
      const { prepareRequiredAnswers } = await import("./web-form");
      const unanswered = await prepareRequiredAnswers(page, input);
      if (unanswered) return unanswered;
      // Interactive captcha only. Ashby stays on the skip-list for auto-apply;
      // this adapter still refuses a visible challenge if it is ever invoked.
      const captcha = await detectBlockingCaptcha(page);
      console.log(`[ashby] captcha check: ${captcha.kind ?? "none"} → ${captcha.blocking ? "BLOCCANTE" : "ok"} (${captcha.detail})`);
      if (captcha.blocking) {
        return {
          ok: false,
          status: "captcha",
          error:
            `Il form Ashby ha un captcha (${captcha.kind}) che blocca l'invio automatico (per design non aggirabile). CV e risposte pronti: completa il captcha e invia manualmente.`,
        };
      }

      const guarded = await inspectLivePage(page);
      if (guarded) return guarded;
      const wrong = await abortIfFieldsWrong(page, input);
      if (wrong) return wrong;
      if (input.dryRun) {
        return { ok: true, status: "submitted", confirmation: "DRY_RUN" };
      }

      const submit = await findSubmitButton(page);
      if (!submit) {
        return {
          ok: false,
          status: "missing_field",
          error: "Bottone submit Ashby non trovato.",
        };
      }

      return (await observeSubmission(page, "ashby", input.jobUrl,
        () => submit.click({ timeout: 5_000 }), input.beforeSubmit, { applicationId: input.applicationId })).outcome;
    } catch (err) {
      return {
        ok: false,
        status: "unknown_error",
        error: err instanceof Error ? err.message : "Errore imprevisto Ashby",
      };
    }
  },
};
