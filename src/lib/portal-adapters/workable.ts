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
      await ensureConsent(page);

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
          jobTitle: input.jobTitle ?? p.title,
          company: input.company ?? null,
          jobDescription: input.jobDescription,
          autonomous: input.autonomous === true,
          storedAnswers: input.storedAnswers,
        });
        pendingQuestions = ai.unanswered;
        if (ai.given.length > 0) input.onAiAnswers?.(ai.given);
        console.log(`[workable] ai-answer: answered=${ai.answered} remaining=${ai.remainingRequired} | ${ai.details.join(" ; ")}`);
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
      await ensureConsent(page); // ri-render dopo le risposte AI può aver resettato la checkbox
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

      await submit.first().scrollIntoViewIfNeeded().catch(() => void 0);
      let clickError: string | null = null;
      try {
        await submit.first().click({ timeout: 8000 });
      } catch (err) {
        clickError = err instanceof Error ? err.message.split("\n")[0] : String(err);
        console.warn(`[workable] click submit fallito (${clickError}) → retry force`);
        await submit.first().click({ timeout: 5000, force: true }).catch(() => void 0);
      }
      // attendi che il network si quieti (cattura tutte le POST)
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => void 0);
      await page.waitForTimeout(1200);
      page.off("response", onResponse);
      console.log(
        `[workable] post-submit network: ${postLog.length} POST/PUT — ${postLog.slice(0, 4).map((p) => `${p.status} ${p.url.split("/").slice(2, 5).join("/")}`).join(" | ")}`,
      );
      const bodyText = await page.locator("body").innerText().catch(() => "");

      // Diagnostica post-click (finisce nei log Vercel/Railway): cosa mostra la
      // pagina, quali campi risultano segnalati. Serve quando non parte nessuna
      // POST: la validazione client di Workable non usa classi "error".
      if (postLog.length === 0) {
        const diag = (await page
          .evaluate(`(() => {
            const bad = [];
            document.querySelectorAll('[aria-invalid="true"], [role="alert"], [data-ui*="error" i], [class*="error" i], [class*="invalid" i], [class*="Error"]').forEach((e) => {
              const l = e.id ? document.querySelector('label[for="' + e.id + '"]') : null;
              const t = ((l && l.textContent) || e.getAttribute('aria-label') || e.textContent || e.getAttribute('name') || '').replace(/\\s+/g, ' ').trim().slice(0, 70);
              if (t) bad.push(t);
            });
            const reqEmpty = [];
            document.querySelectorAll('input, textarea, select').forEach((el) => {
              const req = el.required || el.getAttribute('aria-required') === 'true';
              if (!req) return;
              const t = (el.type || el.tagName).toLowerCase();
              let empty = false;
              if (t === 'file') empty = !(el.files && el.files.length);
              else if (t === 'radio') empty = !document.querySelector('input[type=radio][name="' + el.name + '"]:checked');
              else if (t === 'checkbox') empty = !el.checked;
              else empty = !(el.value || '').trim();
              if (empty) { const l = el.id ? document.querySelector('label[for="' + el.id + '"]') : null; reqEmpty.push((t + ':' + (el.name || el.id || '') + ' ' + ((l && l.textContent) || el.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ').trim().slice(0, 60)); }
            });
            const txt = (document.body.innerText || '').replace(/\\s+/g, ' ');
            const hints = (txt.match(/[^.]{0,60}(required|obbligatori|invalid|non valid|please|must|error|errore)[^.]{0,60}/gi) || []).slice(0, 6);
            return { bad: [...new Set(bad)].slice(0, 10), reqEmpty: reqEmpty.slice(0, 10), hints, title: document.title, textLen: txt.length, tail: txt.slice(-300) };
          })()`)
          .catch((e) => ({ error: String(e) }))) as Record<string, unknown>;
        console.log(`[workable] post-click diag url=${page.url()} → ${JSON.stringify(diag).slice(0, 1500)}`);
      }

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
      // Nessuna POST: quasi sempre validazione client (campo required vuoto,
      // consenso, file). Raccogliamo i messaggi e lo diciamo chiaramente
      // invece di un UNCONFIRMED muto.
      const clientErrors = (await page
        .evaluate(`Array.from(document.querySelectorAll('[aria-invalid="true"], [role="alert"], [class*="error" i], [class*="invalid" i]')).map((e) => { const l = e.id ? document.querySelector('label[for="' + e.id + '"]') : null; return ((l && l.textContent) || e.getAttribute('aria-label') || e.textContent || e.getAttribute('name') || '').replace(/\\s+/g, ' ').trim().slice(0, 80); }).filter(Boolean).slice(0, 8)`)
        .catch(() => [])) as string[];
      if (postLog.length === 0 && (clientErrors.length > 0 || clickError)) {
        return {
          ok: false,
          status: "validation_failed",
          error: `Submit Workable senza POST: ${clickError ? `click fallito (${clickError}); ` : ""}${clientErrors.length ? `campi non validi: ${[...new Set(clientErrors)].join(" | ")}` : "validazione client-side"}`,
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

/**
 * Spunta le checkbox di consenso (GDPR/privacy). Workable ri-renderizza il
 * form dopo le risposte AI e può resettare l'input: va richiamata anche
 * subito prima del submit.
 */
async function ensureConsent(page: import("playwright").Page): Promise<void> {
  for (const sel of [
    'input[type="checkbox"][name="gdpr"]',
    'input[type="checkbox"][name*="consent" i]',
    'input[type="checkbox"][name*="privacy" i]',
  ]) {
    const cb = page.locator(sel);
    if ((await cb.count()) === 0) continue;
    const first = cb.first();
    const already = (await first.isChecked().catch(() => false)) as boolean;
    if (already) continue;
    await first.check({ timeout: 1500, force: true }).catch(() => void 0);
    if (!((await first.isChecked().catch(() => false)) as boolean)) {
      // input nascosto dietro una UI custom: clicca la label collegata
      const id = await first.getAttribute("id").catch(() => null);
      const label = id ? page.locator(`label[for="${id}"]`) : first.locator("xpath=ancestor::label[1]");
      if ((await label.count()) > 0) await label.first().click({ timeout: 1500 }).catch(() => void 0);
      if (!((await first.isChecked().catch(() => false)) as boolean)) {
        await first.evaluate((e) => { const i = e as HTMLInputElement; i.checked = true; i.dispatchEvent(new Event("change", { bubbles: true })); i.dispatchEvent(new Event("input", { bubbles: true })); }).catch(() => void 0);
      }
    }
    console.log(`[workable] consenso ${sel}: ${(await first.isChecked().catch(() => false)) ? "spuntato" : "NON spuntato"}`);
  }
}
