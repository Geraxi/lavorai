import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";

/*
 * Workable ATS: apply.workable.com/<slug>/j/<id>/apply/
 * Form pubblico senza login. Campi standard (firstname, lastname, email,
 * phone, resume, cover_letter, gdpr) piu' campi custom obbligatori
 * (CA_/QA_: citta, lingue, salary, anni esperienza, livello, radio si/no)
 * gestiti con lo stesso AI answerer di Greenhouse. Captcha = needs_user_input.
 */

const HOSTS = [/(^|\.)workable\.com$/i];

export const workableAdapter: PortalAdapter = {
  id: "workable",
  label: "Workable",
  matches(url: string): boolean {
    try {
      return HOSTS.some((re) => re.test(new URL(url).hostname));
    } catch {
      return false;
    }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
    // Form sulla route /apply/ (con slash finale: senza, l'SPA non monta).
    const base = input.jobUrl.replace(/\/apply\/?$/, "").replace(/\/$/, "");
    const applyUrl = `${base}/apply/`;

    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Workable è React: attendi idratazione del form.
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => void 0);
    await page.waitForTimeout(1500);

    const fnLoc = page.locator(
      'input[name="firstname"], input#firstname, input[aria-label*="First" i]',
    );
    try {
      await fnLoc.first().waitFor({ timeout: 15_000 });
    } catch {
      return { ok: false, status: "form_not_found", error: "Form Workable non rilevato." };
    }

    try {
      // ----- Campi standard -----
      await fnLoc.first().fill(input.profile.firstName || "").catch(() => void 0);
      await page.locator('input[name="lastname"], input#lastname').first()
        .fill(input.profile.lastName || "").catch(() => void 0);
      await page.locator('input[name="email"], input[type="email"]').first()
        .fill(input.profile.email?.trim() || input.userEmail).catch(() => void 0);
      const phoneToUse = input.profile.phone?.trim() || input.userPhone;
      if (phoneToUse) {
        await page.locator('input[name="phone"], input[type="tel"]').first()
          .fill(phoneToUse).catch(() => void 0);
      }

      // ----- CV (obbligatorio) -----
      const cvInput = page.locator('input[type="file"]');
      if ((await cvInput.count()) === 0) {
        return { ok: false, status: "missing_field", error: "Input upload CV non trovato (Workable)." };
      }
      await cvInput.first().setInputFiles(input.cvLocalPath).catch(() => void 0);
      const cvBase = input.cvLocalPath.split(/[\\/]/).pop() || "cv";
      let cvOk = false;
      for (let i = 0; i < 10 && !cvOk; i++) {
        await page.waitForTimeout(400);
        cvOk = await page.evaluate((name) => {
          try {
            return (document.body.innerText || "").toLowerCase().includes(name.toLowerCase());
          } catch { return false; }
        }, cvBase).catch(() => false);
      }

      // ----- Cover letter (opzionale) -----
      const cl = page.locator('textarea[name="cover_letter"], textarea[name*="cover" i]');
      if ((await cl.count()) > 0) {
        await cl.first().fill(input.coverLetterText).catch(() => void 0);
      }

      // ----- GDPR / consenso -----
      for (const sel of [
        'input[type="checkbox"][name="gdpr"]',
        'input[type="checkbox"][name*="consent" i]',
        'input[type="checkbox"][name*="privacy" i]',
      ]) {
        const cb = page.locator(sel);
        if ((await cb.count()) > 0) await cb.first().check({ timeout: 1500 }).catch(() => void 0);
      }

      // ----- Campi custom obbligatori (CA_*/QA_*) via AI answerer -----
      let pendingQuestions: import("./types").PendingQuestion[] = [];
      try {
        const { answerRequiredFields } = await import("./ai-answer");
        const p = input.profile;
        const links = p.links ?? [];
        const findLink = (re: RegExp) => links.find((l) => re.test(`${l.url} ${l.label}`))?.url;
        const cvText = [
          p.summary,
          ...(p.experiences ?? []).map(
            (e) => `${e.role} @ ${e.company} (${e.startDate}-${e.endDate || "Present"}): ${e.description || (e.bullets ?? []).join("; ")}`,
          ),
        ].filter(Boolean).join("\n");
        const ai = await answerRequiredFields(page, {
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email || input.userEmail,
          phone: p.phone || input.userPhone,
          city: input.answers?.city || p.city,
          country: input.answers?.country,
          linkedinUrl: input.answers?.linkedinUrl || findLink(/linkedin/i),
          portfolioUrl: input.answers?.portfolioUrl || findLink(/portfolio|dribbble|behance/i),
          workAuth: input.answers?.workAuthEU,
          salaryExpectationEur: input.answers?.salaryExpectationEur,
          cvText,
          jobTitle: p.title,
          company: null,
          storedAnswers: input.storedAnswers,
        });
        pendingQuestions = ai.unanswered;
        console.log(`[workable] ai-answer: answered=${ai.answered} remaining=${ai.remainingRequired}`);
      } catch (err) {
        console.warn("[workable] ai-answer failed", err);
      }

      // ----- Captcha? -----
      const hasCaptcha = await page.evaluate(() => {
        const resp = document.querySelector('textarea[name="g-recaptcha-response"], #g-recaptcha-response') as HTMLTextAreaElement | null;
        const widget = document.querySelector('.g-recaptcha, .grecaptcha-badge, iframe[src*="recaptcha"], [class*="hcaptcha"], iframe[src*="hcaptcha"], .cf-turnstile, iframe[src*="turnstile"]');
        return !!widget && (!resp || !resp.value.trim());
      }).catch(() => false);
      if (hasCaptcha) {
        return { ok: false, status: "captcha", error: "Form Workable con captcha: completa l'invio a mano (CV e risposte pronti)." };
      }

      if (pendingQuestions.length > 0) {
        return {
          ok: false,
          status: "needs_user_input",
          error: `${pendingQuestions.length} domande obbligatorie richiedono la tua risposta prima dell'invio.`,
          pendingQuestions,
        };
      }

      if (!cvOk) {
        return { ok: false, status: "missing_field", error: "CV non risultato attaccato (Workable)." };
      }

      if (input.dryRun) {
        return { ok: true, status: "submitted", confirmation: "DRY_RUN" };
      }

      // ----- Submit + verifica HARD -----
      const submit = page.locator(
        'button[type="submit"], button:has-text("Submit"), button:has-text("Apply"), button:has-text("Invia"), button:has-text("Send")',
      );
      if ((await submit.count()) === 0) {
        return { ok: false, status: "missing_field", error: "Bottone submit Workable non trovato." };
      }
      const urlBefore = page.url();
      await submit.first().click().catch(() => void 0);
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => void 0);
      await page.waitForTimeout(1200);
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const confirmed =
        /thank|applied|submitted|grazie|received|confirm|invi(at|o)|application has been/i.test(bodyText) ||
        /thank|confirm|success/i.test(page.url()) ||
        page.url() !== urlBefore;
      return { ok: true, status: "submitted", confirmation: confirmed ? "DETECTED" : "UNCONFIRMED" };
    } catch (err) {
      return {
        ok: false,
        status: "unknown_error",
        error: err instanceof Error ? err.message : "Errore imprevisto Workable",
      };
    }
  },
};
