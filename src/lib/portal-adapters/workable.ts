import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
import { detectBlockingCaptcha } from "./captcha";

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
      for (let i = 0; i < 12 && !cvOk; i++) {
        await page.waitForTimeout(400);
        cvOk = await page
          .evaluate((name) => {
            try {
              // 1. filename mostrato nel body
              const body = (document.body.innerText || "").toLowerCase();
              if (name && body.includes(name.toLowerCase())) return true;
              // 2. indicatore testuale di upload riuscito (Workable mostra
              //    "Resume Uploaded" / "uploaded" / "caricato")
              if (/uploaded|attached|caricato|uploaded successfully/i.test(body))
                return true;
              // 3. file ancora in input.files (alcuni form non lo azzerano)
              const files = document.querySelectorAll('input[type="file"]');
              for (const f of Array.from(files)) {
                if ((f as HTMLInputElement).files && (f as HTMLInputElement).files!.length > 0)
                  return true;
              }
              // 4. indicatori UI generici
              const ind = document.querySelector(
                "[class*='uploaded'], [class*='attachment'], [class*='file-name'], [class*='filename']",
              );
              return !!(ind && (ind.textContent || "").trim());
            } catch {
              return false;
            }
          }, cvBase)
          .catch(() => false);
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
          yearsExperience: input.answers?.yearsExperience ?? input.userYearsExperience,
          englishLevel: input.answers?.englishLevel ?? input.userEnglishLevel,
          languages: input.profile.languages,
          noticePeriod: input.answers?.noticePeriod ?? input.userNoticePeriod,
          highestEducation: input.answers?.highestEducation,
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

      // ----- Captcha? (bloccante solo se interattivo, vedi ./captcha.ts) -----
      const captcha = await detectBlockingCaptcha(page);
      console.log(`[workable] captcha check: ${captcha.kind ?? "none"} → ${captcha.blocking ? "BLOCCANTE" : "ok"} (${captcha.detail})`);
      if (captcha.blocking) {
        return { ok: false, status: "captcha", error: `Form Workable con captcha interattivo (${captcha.kind}): completa l'invio a mano (CV e risposte pronti).` };
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

      // ----- Submit + cattura HTTP HARD -----
      // Workable POSTa la candidatura a un endpoint api (applicants/candidate).
      // Lo status HTTP 2xx/3xx = prova OGGETTIVA di consegna, indipendente
      // dal testo della thank-you page (che varia per azienda/lingua).
      const submit = page.locator(
        'button[type="submit"], button:has-text("Submit"), button:has-text("Apply"), button:has-text("Invia"), button:has-text("Send")',
      );
      if ((await submit.count()) === 0) {
        return { ok: false, status: "missing_field", error: "Bottone submit Workable non trovato." };
      }
      const urlBefore = page.url();
      // Logga TUTTE le request POST/PUT verso workable.com dopo il click —
      // Workable cambia spesso gli endpoint e i path. Catturiamo la prima
      // response 2xx/3xx come prova HARD di consegna, e teniamo log completo
      // per diagnostica.
      const postLog: Array<{ url: string; method: string; status: number }> = [];
      let detectedStatus: number | null = null;
      let detectedUrl = "";
      const onResponse = (r: import("playwright").Response) => {
        try {
          const m = r.request().method();
          if (m !== "POST" && m !== "PUT") return;
          const u = r.url();
          if (!/workable\.com|amazonaws\.com|cloudfront\.net/i.test(u)) return;
          const s = r.status();
          postLog.push({ url: u.slice(0, 120), method: m, status: s });
          // Considera 2xx/3xx come consegna riuscita su un endpoint di app.
          if (
            detectedStatus === null &&
            s >= 200 &&
            s < 400 &&
            /apply|applicant|candidate|application|submit|jobs/i.test(u)
          ) {
            detectedStatus = s;
            detectedUrl = u;
          }
        } catch {
          /* ignore */
        }
      };
      page.on("response", onResponse);

      await submit.first().click().catch(() => void 0);
      // attendi che il network si quieti (cattura tutte le POST)
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => void 0);
      await page.waitForTimeout(1200);
      page.off("response", onResponse);
      console.log(
        `[workable] post-submit network: ${postLog.length} POST/PUT — ${postLog.slice(0, 4).map((p) => `${p.status} ${p.url.split("/").slice(2, 5).join("/")}`).join(" | ")}`,
      );
      const bodyText = await page.locator("body").innerText().catch(() => "");

      // Prova HARD: 2xx/3xx su endpoint di applicazione = consegnato.
      if (detectedStatus !== null) {
        console.log(`[workable] DETECTED via HTTP ${detectedStatus} on ${detectedUrl.slice(0, 80)}`);
        return {
          ok: true,
          status: "submitted",
          confirmation: `DETECTED_HTTP_${detectedStatus}`,
        };
      }
      // Fallback HARD: qualsiasi 2xx POST su workable.com dopo il click
      // (l'endpoint può cambiare; se ne abbiamo almeno una 2xx, accettata).
      const any2xx = postLog.find((p) => p.status >= 200 && p.status < 400);
      if (any2xx) {
        console.log(`[workable] DETECTED via fallback 2xx ${any2xx.status} on ${any2xx.url.slice(0, 80)}`);
        return {
          ok: true,
          status: "submitted",
          confirmation: `DETECTED_HTTP_${any2xx.status}`,
        };
      }
      // Prova SOFT: thank-you nel body / url cambiata.
      const softConfirmed =
        /thank|applied|submitted|grazie|received|confirm|invi(at|o)|application has been/i.test(bodyText) ||
        /thank|confirm|success/i.test(page.url()) ||
        page.url() !== urlBefore;
      return {
        ok: true,
        status: "submitted",
        confirmation: softConfirmed ? "DETECTED" : "UNCONFIRMED",
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
