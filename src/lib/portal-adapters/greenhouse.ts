import type {
  PortalAdapter,
  ApplyInput,
  ApplyOutcome,
  CanaryLog,
} from "./types";
import type { Page } from "playwright";

/**
 * Canary helper: scatta uno screenshot della page corrente e lo
 * carica su Vercel Blob. Ritorna l'URL pubblico, o null se fallisce
 * o se Blob non è configurato. Mai throws — la canary deve essere
 * non-distruttiva sul flow di submit.
 */
async function uploadScreenshot(
  page: Page,
  label: string,
  applicationId: string | undefined,
): Promise<string | null> {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
    const { put } = await import("@vercel/blob");
    const buf = await page.screenshot({ type: "png", fullPage: false });
    const filename = `canary/${applicationId ?? "noid"}-${label}-${Date.now()}.png`;
    const blob = await put(filename, buf, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    });
    return blob.url;
  } catch (err) {
    console.warn("[canary] screenshot upload failed", err);
    return null;
  }
}

/**
 * Canary helper: estrae lo stato attuale di TUTTI i campi form
 * (name, label, type, value-length, required). Risponde alla domanda
 * "il form è davvero compilato come dovrebbe essere prima del submit?".
 */
async function captureFormFields(
  page: Page,
): Promise<CanaryLog["fields"]> {
  return page.evaluate(() => {
    const out: Array<{
      name: string;
      label: string;
      type: string;
      valueLength: number;
      required: boolean;
    }> = [];
    const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    );
    inputs.forEach((el) => {
      const id = el.id || "";
      const labelEl = id
        ? document.querySelector(`label[for="${id}"]`)
        : el.closest("label");
      out.push({
        name: el.name || id || el.getAttribute("aria-label") || "(anon)",
        label: (labelEl?.textContent ?? "").trim().slice(0, 120),
        type:
          (el as HTMLInputElement).type ||
          el.tagName.toLowerCase(),
        valueLength:
          (el as HTMLInputElement).type === "file"
            ? (el as HTMLInputElement).files?.[0]?.name?.length ?? 0
            : (el.value ?? "").length,
        required: el.required ?? false,
      });
    });
    return out;
  });
}

/**
 * Legge il filename del file effettivamente attaccato all'input resume.
 * Null se nessun file attached → CV mancante → submission rotta.
 */
async function readResumeFilename(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const candidates = document.querySelectorAll<HTMLInputElement>(
      'input[type="file"]',
    );
    for (const inp of Array.from(candidates)) {
      const name = (inp.name + " " + (inp.getAttribute("aria-label") ?? "")).toLowerCase();
      if (name.includes("resume") || name.includes("cv")) {
        return inp.files?.[0]?.name ?? null;
      }
    }
    // Fallback: primo input file con un file attaccato
    for (const inp of Array.from(candidates)) {
      if (inp.files && inp.files.length > 0) return inp.files[0]!.name;
    }
    return null;
  });
}

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
    // Le aziende moderne (Stripe, SumUp, ecc) configurano boards.greenhouse.io
    // per redirezionare alla loro career page custom. Il form puro Greenhouse
    // resta accessibile via:
    //   1. <jobUrl>/apply  → spesso bypassa il redirect lato Greenhouse
    //   2. boards.greenhouse.io/embed/job_app?for=<slug>&token=<id> → form puro
    // Proviamo (1) per primo; se anche /apply redirige a career custom,
    // fallback su (2).
    const candidates = buildApplyUrlCandidates(input.jobUrl);
    let formFound = false;
    let lastUrlTried = "";
    for (const tryUrl of candidates) {
      lastUrlTried = tryUrl;
      try {
        await page.goto(tryUrl, {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        });
      } catch {
        continue;
      }
      // Verifica subito se siamo finiti su una career page custom
      // (hostname diverso da greenhouse.io)
      const finalHost = (() => {
        try {
          return new URL(page.url()).hostname.toLowerCase();
        } catch {
          return "";
        }
      })();
      if (!finalHost.includes("greenhouse.io")) {
        // redirect fuori da Greenhouse → prova URL successivo
        continue;
      }
      // Cerca firma form (input first_name) — se c'è, abbiamo trovato
      const fnProbe = page.locator(
        'input[name="first_name"], input#first_name, input[aria-label*="First" i]',
      );
      try {
        await fnProbe.first().waitFor({ timeout: 8_000 });
        formFound = true;
        break;
      } catch {
        // niente form qui, prossimo
      }
    }

    if (!formFound) {
      return {
        ok: false,
        status: "form_not_found",
        error: `Form Greenhouse non rilevato (provati ${candidates.length} URL, ultimo: ${lastUrlTried}). Probabile career page custom dell'azienda.`,
      };
    }

    const firstName = page.locator(
      'input[name="first_name"], input#first_name, input[aria-label*="First" i]',
    );

    try {
      // Fallback obbligatorio: se profile.email è vuoto (Claude non
      // l'ha estratto dal CV), uso l'email dell'account. Senza email il
      // recruiter non può rispondere.
      const emailToUse = input.profile.email?.trim() || input.userEmail;
      const phoneToUse = input.profile.phone?.trim() || input.userPhone;

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
        .fill(emailToUse)
        .catch(() => void 0);
      if (phoneToUse) {
        await page
          .locator(
            'input[name="phone"], input#phone, input[type="tel"], input[aria-label*="Phone" i]',
          )
          .first()
          .fill(phoneToUse)
          .catch(() => void 0);
      }

      // ============================================================
      // Upload CV — HARDENED contro le varianti Greenhouse.
      // ============================================================
      // Greenhouse ha 2 pattern:
      //   1. Legacy: <input type="file" id="resume"> diretto
      //   2. Modern (job-boards.greenhouse.io): React dropzone con
      //      l'input nascosto + bottone "Attach"/"Allega". Spesso
      //      l'input esiste ma è display:none; Playwright setInputFiles
      //      funziona comunque su input nascosti MA il React state si
      //      aggiorna solo se l'input riceve l'evento change nativo.
      //
      // Strategia robusta:
      //   a. Trova l'input file più specifico (resume > generico)
      //   b. setInputFiles (dispatcha change nativo)
      //   c. Verifica che il file sia ATTACCATO leggendo input.files
      //   d. Se non attaccato, prova il filechooser via bottone Attach
      //   e. Verifica di nuovo; se ancora vuoto → missing_field esplicito
      const resumeSelectors = [
        'input[type="file"][name*="resume" i]',
        'input[type="file"][aria-label*="resume" i]',
        'input[type="file"]#resume',
        'input[type="file"][name*="cv" i]',
        'input[type="file"]',
      ];
      let cvAttached = false;
      for (const sel of resumeSelectors) {
        const loc = page.locator(sel);
        if ((await loc.count()) === 0) continue;
        try {
          await loc.first().setInputFiles(input.cvLocalPath);
          // Verifica reale: il file è davvero nel DOM input?
          const fname = await loc
            .first()
            .evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? null)
            .catch(() => null);
          if (fname) {
            cvAttached = true;
            break;
          }
        } catch {
          /* prova selettore successivo */
        }
      }

      // Fallback: filechooser via bottone "Attach"/"Allega"/"Upload"
      if (!cvAttached) {
        const attachBtn = page.locator(
          'button:has-text("Attach"), button:has-text("Allega"), button:has-text("Upload"), label:has-text("resume" i), [role="button"]:has-text("Attach")',
        );
        if ((await attachBtn.count()) > 0) {
          try {
            const [chooser] = await Promise.all([
              page.waitForEvent("filechooser", { timeout: 5000 }),
              attachBtn.first().click(),
            ]);
            await chooser.setFiles(input.cvLocalPath);
            await page.waitForTimeout(500);
            // Re-verifica
            const anyFile = await page
              .locator('input[type="file"]')
              .first()
              .evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? null)
              .catch(() => null);
            cvAttached = !!anyFile;
          } catch {
            /* filechooser non disponibile */
          }
        }
      }

      if (!cvAttached) {
        // NON proseguiamo col submit se il CV non è attaccato: una
        // candidatura senza CV è worse than nothing (ghost record,
        // zero conferma). Falliamo esplicito → worker logga + fallback.
        return {
          ok: false,
          status: "missing_field",
          error:
            "CV non attaccato al form Greenhouse (né input diretto né filechooser hanno registrato il file). Submission abortita per non inviare candidatura vuota.",
        };
      }

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

      // Fill custom questions usando le risposte standard dell'utente
      // (work auth, salary, notice period, LinkedIn, EEO, ecc).
      // Eseguito PRIMA di check/submit così le validazioni required
      // non bloccano i campi vuoti.
      try {
        const { fillCustomQuestions } = await import("./generic-fill");
        const r = await fillCustomQuestions(page, input.answers);
        if (r.filled > 0) {
          console.log(
            `[greenhouse] custom questions filled: ${r.filled} (${r.matched.slice(0, 4).join(", ")})`,
          );
        }
      } catch (err) {
        console.warn("[greenhouse] generic-fill failed", err);
      }

      // GDPR/consenso + accetta termini (best-effort) — PRIMA dell'AI answerer
      // così non vengono contati come "domande senza risposta".
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

      // AI answerer: compila i campi OBBLIGATORI ancora vuoti (incl.
      // react-select custom) usando le risposte già date dall'utente +
      // SOLO i dati reali del candidato. Senza questo, i form Greenhouse con
      // domande custom obbligatorie restano incompleti → validazione client
      // blocca il submit (causa storica dei 0/126 DETECTED).
      let pendingQuestions: import("./types").PendingQuestion[] = [];
      let aiDebug = "";
      try {
        const { answerRequiredFields } = await import("./ai-answer");
        const p = input.profile;
        const links = p.links ?? [];
        const findLink = (re: RegExp) =>
          links.find((l) => re.test(`${l.url} ${l.label}`))?.url;
        const cvText = [
          p.summary,
          ...(p.experiences ?? []).map(
            (e) =>
              `${e.role} @ ${e.company} (${e.startDate}-${e.endDate || "Present"}): ${e.description || (e.bullets ?? []).join("; ")}`,
          ),
        ]
          .filter(Boolean)
          .join("\n");
        const ai = await answerRequiredFields(page, {
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email || input.userEmail,
          phone: p.phone || input.userPhone,
          city: input.answers?.city || p.city,
          country: input.answers?.country,
          linkedinUrl: input.answers?.linkedinUrl || findLink(/linkedin/i),
          portfolioUrl:
            input.answers?.portfolioUrl ||
            findLink(/portfolio|dribbble|behance/i),
          workAuth: input.answers?.workAuthEU,
          cvText,
          jobTitle: p.title,
          company: null,
          storedAnswers: input.storedAnswers,
        });
        pendingQuestions = ai.unanswered;
        aiDebug = `answered=${ai.answered} remaining=${ai.remainingRequired} | ${ai.details.join(" ; ")}`;
        console.log(`[greenhouse] ai-answer: ${aiDebug}`);
      } catch (err) {
        aiDebug = "ai-answer THREW: " + (err instanceof Error ? err.message : String(err));
        console.warn("[greenhouse] ai-answer failed", err);
      }

      // Se restano campi OBBLIGATORI senza risposta, NON inviamo un form
      // incompleto (verrebbe bloccato). Chiediamo all'utente: il worker
      // mette la candidatura in "needs_answers" e raccoglie le risposte.
      if (pendingQuestions.length > 0) {
        return {
          ok: false,
          status: "needs_user_input",
          error: `${pendingQuestions.length} domande obbligatorie richiedono la tua risposta prima dell'invio.`,
          pendingQuestions,
          debug: aiDebug,
        };
      }

      if (input.dryRun) {
        return { ok: true, status: "submitted", confirmation: "DRY_RUN" };
      }

      // ============================================================
      // CANARY DEBUG — gated da env CANARY_DEBUG=1
      // Cattura forensica pre-submit: filename CV attaccato, tutti i
      // campi form, screenshot. Risponde alla domanda "il submit è
      // davvero andato in porto con i dati corretti?".
      // Zero impatto sul flow normale quando flag spento.
      // ============================================================
      const canaryEnabled = process.env.CANARY_DEBUG === "1";
      let canaryPre: {
        resumeAttachedFilename: string | null;
        preSubmitScreenshotUrl: string | null;
        fields: CanaryLog["fields"];
        urlBeforeSubmit: string;
        capturedAt: string;
      } | null = null;
      if (canaryEnabled) {
        try {
          const [resumeFn, fields, screenshotUrl] = await Promise.all([
            readResumeFilename(page),
            captureFormFields(page),
            uploadScreenshot(page, "pre-submit", input.applicationId),
          ]);
          canaryPre = {
            resumeAttachedFilename: resumeFn,
            preSubmitScreenshotUrl: screenshotUrl,
            fields,
            urlBeforeSubmit: page.url(),
            capturedAt: new Date().toISOString(),
          };
          console.log(
            `[canary] pre-submit — resume="${resumeFn ?? "MISSING"}" fields=${fields.length} screenshot=${screenshotUrl ? "ok" : "skipped"}`,
          );
        } catch (err) {
          console.warn("[canary] pre-submit capture failed", err);
        }
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
      // ============================================================
      // VERIFICA HARD: cattura la risposta HTTP della POST di submission
      // ============================================================
      // Greenhouse, quando clicchi submit, fa una POST a uno dei suoi
      // endpoint interni (forms tipo /jobs/<id>/applications,
      // /api/embed/job_application, /forms/jobs/<id>). Lo status code
      // della risposta è la verità — il DOM è una conseguenza.
      //
      //   - 2xx (200/201) → submission ACCETTATA dal server
      //   - 302/303 redirect a /thank_you o simili → ACCETTATA
      //   - 4xx (400/422) → server ha rifiutato (validation, dup, ecc)
      //   - 5xx → errore server, retry potenziale
      //   - nessuna POST = la validazione client-side ha bloccato il
      //     submit prima ancora di inviare → NON arrivata
      const urlBeforeSubmit = page.url();
      const submissionResponsePromise = page
        .waitForResponse(
          (resp) => {
            const u = resp.url().toLowerCase();
            const m = resp.request().method().toUpperCase();
            if (m !== "POST") return false;
            // Endpoint Greenhouse di submission noti. Manteniamo larga
            // la lista perché Greenhouse ha diverse forme:
            //   - boards.greenhouse.io/embed/job_app/submit
            //   - job-boards.greenhouse.io/api/.../job_applications
            //   - boards.greenhouse.io/<co>/jobs/<id>/applications
            return (
              u.includes("greenhouse.io") &&
              (u.includes("/applications") ||
                u.includes("/job_app") ||
                u.includes("/submit") ||
                u.includes("/job_application"))
            );
          },
          { timeout: 25_000 },
        )
        .catch(() => null);

      await submit.first().click();

      const submissionResponse = await submissionResponsePromise;

      // Diamo comunque un po' di tempo al DOM di stabilizzarsi
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => void 0);
      await page.waitForTimeout(800);

      const finalUrl = page.url();
      const bodyText = await page.locator("body").innerText().catch(() => "");

      // Estrai body HTTP della response submit (se presente) per canary.
      let submitHttpBody: string | null = null;
      let submitHttpStatus: number | null = null;
      if (submissionResponse) {
        submitHttpStatus = submissionResponse.status();
        try {
          const body = await submissionResponse.text();
          submitHttpBody = body.slice(0, 800).replace(/\s+/g, " ");
        } catch {
          /* already consumed */
        }
      }

      // Canary post-submit: screenshot + completa il payload con
      // l'osservazione dopo il click. Helper centrale così OGNI return
      // path porta indietro lo stesso payload.
      let canaryFull: CanaryLog | undefined;
      if (canaryEnabled && canaryPre) {
        const postScreenshot = await uploadScreenshot(
          page,
          "post-submit",
          input.applicationId,
        );
        canaryFull = {
          resumeAttachedFilename: canaryPre.resumeAttachedFilename,
          preSubmitScreenshotUrl: canaryPre.preSubmitScreenshotUrl,
          postSubmitScreenshotUrl: postScreenshot,
          fields: canaryPre.fields,
          submitHttpStatus,
          submitHttpBody,
          urlBeforeSubmit: canaryPre.urlBeforeSubmit,
          urlAfterSubmit: finalUrl,
          bodyTextAfterSubmit: bodyText.slice(0, 800).replace(/\s+/g, " "),
          capturedAt: canaryPre.capturedAt,
        };
        console.log(
          `[canary] post-submit — http=${submitHttpStatus ?? "none"} urlChanged=${finalUrl !== canaryPre.urlBeforeSubmit} screenshot=${postScreenshot ? "ok" : "skipped"}`,
        );
      }

      // ============================================================
      // CASE A: catturata la POST → decide dallo status code
      // ============================================================
      if (submissionResponse) {
        const status = submitHttpStatus ?? submissionResponse.status();
        // 2xx o 3xx redirect → ACCETTATA dal server.
        if (status >= 200 && status < 400) {
          return {
            ok: true,
            status: "submitted",
            confirmation: `DETECTED_HTTP_${status}`,
            canary: canaryFull,
          };
        }
        // 4xx → server rifiuta (validazione, duplicato, job chiuso).
        if (status >= 400 && status < 500) {
          return {
            ok: false,
            status: "validation_failed",
            error: `Greenhouse ha rifiutato la submission (HTTP ${status}). Server response: "${submitHttpBody ?? "(empty)"}"`,
            canary: canaryFull,
          };
        }
        // 5xx → errore server. Caller retry.
        return {
          ok: false,
          status: "unknown_error",
          error: `Greenhouse ha risposto con HTTP ${status} — errore server, retry consigliato.`,
          canary: canaryFull,
        };
      }

      // ============================================================
      // CASE B: nessuna POST catturata → validazione client-side ha
      // bloccato il submit OPPURE l'endpoint non corrisponde al pattern
      // ============================================================
      const errorPatterns =
        /(there\s+(was|were)\s+problems?|this\s+field\s+is\s+required|please\s+(correct|fix|enter)|invalid\s+(email|input|file)|errore|campo\s+obbligatorio|inserisci|file\s+too\s+large|select\s+a\s+(valid\s+)?file)/i;
      if (errorPatterns.test(bodyText)) {
        return {
          ok: false,
          status: "validation_failed",
          error: `Validazione client-side ha bloccato il submit (nessuna POST partita). Body excerpt: "${bodyText.slice(0, 240).replace(/\s+/g, " ")}"`,
          canary: canaryFull,
        };
      }

      const strongConfirmRegex =
        /(thank\s+you|application\s+(received|submitted|successful)|your\s+application\s+has\s+been|grazie\s+per|candidatura\s+(inviata|ricevuta)|we\s+received\s+your)/i;
      const urlChanged = finalUrl !== urlBeforeSubmit;
      const urlHasConfirm = /thank|confirm|received|success/i.test(finalUrl);
      if (strongConfirmRegex.test(bodyText) || urlHasConfirm) {
        return {
          ok: true,
          status: "submitted",
          confirmation: "DETECTED_DOM",
          canary: canaryFull,
        };
      }

      return {
        ok: false,
        status: "unknown_error",
        error: `Submit cliccato ma niente è stato confermato (no POST HTTP catturata, no thank-you page, no error banner). URL ${urlChanged ? "cambiato" : "invariato"}: ${finalUrl}. Caller dovrebbe ritentare.`,
        canary: canaryFull,
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

/**
 * Genera URL candidati per raggiungere il form puro Greenhouse,
 * bypassando il redirect alla career page custom dell'azienda.
 *
 * Esempio input: https://boards.greenhouse.io/sumup/jobs/8427124002
 * Output:
 *   1. https://boards.greenhouse.io/sumup/jobs/8427124002/apply
 *   2. https://boards.greenhouse.io/embed/job_app?for=sumup&token=8427124002
 *   3. https://boards.greenhouse.io/sumup/jobs/8427124002 (originale)
 */
function buildApplyUrlCandidates(jobUrl: string): string[] {
  const candidates: string[] = [];
  try {
    const u = new URL(jobUrl);
    if (!u.hostname.includes("greenhouse.io")) return [jobUrl];

    // Path tipico: /<slug>/jobs/<id> o /jobs/<id>
    const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
    if (m) {
      const slug = m[1];
      const id = m[2];
      candidates.push(`${u.origin}/${slug}/jobs/${id}/apply`);
      candidates.push(
        `${u.origin}/embed/job_app?for=${encodeURIComponent(slug)}&token=${id}`,
      );
    }
    // Fallback: URL originale (potrebbe ridirigere ma proviamo)
    candidates.push(jobUrl);
  } catch {
    candidates.push(jobUrl);
  }
  return candidates;
}
