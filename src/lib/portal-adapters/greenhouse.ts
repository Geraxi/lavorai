import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";

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

      // Upload CV
      const cvInput = page.locator(
        'input[type="file"][name*="resume" i], input[type="file"][aria-label*="resume" i], input[type="file"]#resume, input[type="file"]',
      );
      if ((await cvInput.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Input upload CV non trovato.",
        };
      }
      await cvInput.first().setInputFiles(input.cvLocalPath);

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

      // GDPR/consenso + accetta termini (best-effort)
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

      if (input.dryRun) {
        return { ok: true, status: "submitted", confirmation: "DRY_RUN" };
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

      // ============================================================
      // CASE A: catturata la POST → decide dallo status code
      // ============================================================
      if (submissionResponse) {
        const status = submissionResponse.status();
        // 2xx o 3xx redirect → ACCETTATA dal server.
        if (status >= 200 && status < 400) {
          return {
            ok: true,
            status: "submitted",
            // Conferma HTTP-level = la più forte possibile.
            confirmation: `DETECTED_HTTP_${status}`,
          };
        }
        // 4xx → server rifiuta (validazione, duplicato, job chiuso).
        if (status >= 400 && status < 500) {
          let serverMsg = "";
          try {
            const body = await submissionResponse.text();
            serverMsg = body.slice(0, 400).replace(/\s+/g, " ");
          } catch {
            /* response già consumata o binary */
          }
          return {
            ok: false,
            status: "validation_failed",
            error: `Greenhouse ha rifiutato la submission (HTTP ${status}). Server response: "${serverMsg}"`,
          };
        }
        // 5xx → errore server. Caller retry.
        return {
          ok: false,
          status: "unknown_error",
          error: `Greenhouse ha risposto con HTTP ${status} — errore server, retry consigliato.`,
        };
      }

      // ============================================================
      // CASE B: nessuna POST catturata → validazione client-side ha
      // bloccato il submit OPPURE l'endpoint non corrisponde al pattern
      // ============================================================
      // Verifica se ci sono error banner visibili — significa che la
      // validazione client ha fermato il submit prima che partisse.
      const errorPatterns =
        /(there\s+(was|were)\s+problems?|this\s+field\s+is\s+required|please\s+(correct|fix|enter)|invalid\s+(email|input|file)|errore|campo\s+obbligatorio|inserisci|file\s+too\s+large|select\s+a\s+(valid\s+)?file)/i;
      if (errorPatterns.test(bodyText)) {
        return {
          ok: false,
          status: "validation_failed",
          error: `Validazione client-side ha bloccato il submit (nessuna POST partita). Body excerpt: "${bodyText.slice(0, 240).replace(/\s+/g, " ")}"`,
        };
      }

      // Fallback DOM-level: forse l'endpoint Greenhouse non matchava il
      // nostro pattern. Cerchiamo conferma forte via thank-you page.
      const strongConfirmRegex =
        /(thank\s+you|application\s+(received|submitted|successful)|your\s+application\s+has\s+been|grazie\s+per|candidatura\s+(inviata|ricevuta)|we\s+received\s+your)/i;
      const urlChanged = finalUrl !== urlBeforeSubmit;
      const urlHasConfirm = /thank|confirm|received|success/i.test(finalUrl);
      if (strongConfirmRegex.test(bodyText) || urlHasConfirm) {
        return {
          ok: true,
          status: "submitted",
          confirmation: "DETECTED_DOM",
        };
      }

      // Cliccato submit, nessuna POST, nessun banner errore, nessuna
      // thank-you page. Non possiamo dichiarare success. Caller retry.
      return {
        ok: false,
        status: "unknown_error",
        error: `Submit cliccato ma niente è stato confermato (no POST HTTP catturata, no thank-you page, no error banner). URL ${urlChanged ? "cambiato" : "invariato"}: ${finalUrl}. Caller dovrebbe ritentare.`,
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
