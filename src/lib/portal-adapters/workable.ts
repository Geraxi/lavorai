import { observeSubmission } from "./submission-proof";
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
      // Workable ha spesso DUE input file: il primo è la FOTO (accept
      // immagini), il secondo è il Resume (accept pdf/doc, required). Il
      // vecchio `.first()` caricava il PDF nel campo foto → CV vuoto →
      // validazione client bloccava il submit senza alcuna POST (UNCONFIRMED).
      const fileInputs = page.locator('input[type="file"]');
      const nFiles = await fileInputs.count();
      if (nFiles === 0) {
        return { ok: false, status: "missing_field", error: "Input upload CV non trovato (Workable)." };
      }
      let cvIdx = -1;
      let photoIdx = -1;
      for (let i = 0; i < nFiles; i++) {
        const el = fileInputs.nth(i);
        const accept = ((await el.getAttribute("accept").catch(() => "")) ?? "").toLowerCase();
        const required = (await el.evaluate((e) => (e as HTMLInputElement).required).catch(() => false)) as boolean;
        const ctx = ((await el.evaluate((e) => (e.closest("[data-ui], fieldset, section, div")?.textContent ?? "")).catch(() => "")) as string)
          .toLowerCase();
        const isImageOnly = accept.length > 0 && /image|\.jpg|\.png|\.gif/.test(accept) && !/pdf|doc|rtf|odt/.test(accept);
        if (isImageOnly) { if (photoIdx < 0) photoIdx = i; continue; }
        const looksResume = /pdf|doc|rtf|odt/.test(accept) || /resume|cv\b|curriculum/.test(ctx) || required;
        if (looksResume && cvIdx < 0) cvIdx = i;
      }
      if (cvIdx < 0) cvIdx = nFiles === 1 ? 0 : (photoIdx === 0 && nFiles > 1 ? 1 : 0);
      const cvInput = fileInputs.nth(cvIdx);
      await cvInput.setInputFiles(input.cvLocalPath).catch(() => void 0);
      console.log(`[workable] resume → file input #${cvIdx + 1}/${nFiles}${photoIdx >= 0 ? ` (foto=#${photoIdx + 1} saltata)` : ""}`);
      let cvOk = false;
      for (let i = 0; i < 12 && !cvOk; i++) {
        await page.waitForTimeout(400);
        // Prova diretta: il file è nell'input scelto (o la UI mostra il nome).
        cvOk = (await cvInput.evaluate((e) => ((e as HTMLInputElement).files?.length ?? 0) > 0).catch(() => false)) as boolean;
        if (!cvOk) {
          const cvBase = (input.cvLocalPath.split(/[\\/]/).pop() || "").toLowerCase();
          const body = ((await page.locator("body").innerText().catch(() => "")) ?? "").toLowerCase();
          cvOk = (!!cvBase && body.includes(cvBase)) || /uploaded successfully|resume uploaded|file uploaded/.test(body);
        }
      }

      // ----- Cover letter (opzionale) -----
      const cl = page.locator('textarea[name="cover_letter"], textarea[name*="cover" i]');
      if ((await cl.count()) > 0) {
        await cl.first().fill(input.coverLetterText).catch(() => void 0);
      }

      // ----- GDPR / consenso -----
      // Required consents need explicit user answers.

      // ----- Campi custom obbligatori (CA_*/QA_*) via AI answerer -----
      let pendingQuestions: import("./types").PendingQuestion[] = [];
      try {
        const { answerRequiredFields } = await import("./ai-answer");
        const { buildAnswerContext } = await import("./web-form");
        const ai = await answerRequiredFields(page, buildAnswerContext(input));
        pendingQuestions = ai.unanswered;
        if (ai.given.length > 0) input.onAiAnswers?.(ai.given);
        console.log(`[workable] ai-answer: answered=${ai.answered} remaining=${ai.remainingRequired} | ${ai.details.join(" ; ")}`);
      } catch (err) {
        console.warn("[workable] ai-answer failed", err);
        pendingQuestions = [{ label: "Verifica dei campi obbligatori non disponibile: controlla il form prima di inviare.", kind: "text" }];
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
      // Banner cookie (fixed, in basso): copre il bottone "Submit application"
      // → il click andava in timeout ed era silenziato. Lo chiudiamo prima.
      for (const label of [/decline all|reject all|rifiuta/i, /accept all|accetta/i]) {
        const cookieBtn = page.getByRole("button", { name: label });
        if ((await cookieBtn.count()) > 0) {
          await cookieBtn.first().click({ timeout: 2000 }).catch(() => void 0);
          await page.waitForTimeout(300);
          break;
        }
      }
      // Required consents need explicit user answers.
      // Bottone preciso: type=submit con testo Submit/Invia (evita match su
      // "Import resume" o sui bottoni del banner cookie che sono type=submit).
      let submit = page.locator('button[type="submit"]').filter({ hasText: /submit|invia|apply|send/i });
      if ((await submit.count()) === 0) submit = page.getByRole("button", { name: /submit application|invia candidatura|submit|apply|invia|send/i });
      if ((await submit.count()) === 0) submit = page.locator('button[type="submit"]');
      const submitText = ((await submit.first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      const submitDisabled = (await submit.first().isDisabled().catch(() => false)) as boolean;
      console.log(`[workable] submit button: "${submitText}" disabled=${submitDisabled} (match=${await submit.count()})`);
      if ((await submit.count()) === 0) {
        return { ok: false, status: "missing_field", error: "Bottone submit Workable non trovato." };
      }
      await submit.first().scrollIntoViewIfNeeded().catch(() => void 0);
      return (await observeSubmission(page, "workable", input.jobUrl,
        () => submit.first().click({ timeout: 8_000 }), input.beforeSubmit, { applicationId: input.applicationId })).outcome;
    } catch (err) {
      return {
        ok: false,
        status: "unknown_error",
        error: err instanceof Error ? err.message : "Errore imprevisto Workable",
      };
    }
  },
};
