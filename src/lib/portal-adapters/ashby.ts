import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
import { detectBlockingCaptcha, challengeAppearedAfterSubmit } from "./captcha";

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
          .waitFor({ timeout: 8_000 });
        formFound = true;
        break;
      } catch {
        // niente form, prossimo tentativo
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
      const fullName = [input.profile.firstName, input.profile.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const emailToUse = input.profile.email?.trim() || input.userEmail;
      const phoneToUse = input.profile.phone?.trim() || input.userPhone;

      // Ashby usa un singolo "Name" o due field separati. Provo entrambi.
      const nameField = page.locator(
        'input[name="_systemfield_name"], input[aria-label*="Full name" i]',
      );
      if ((await nameField.count()) > 0) {
        await nameField.first().fill(fullName).catch(() => void 0);
      } else {
        await page
          .locator('input[aria-label*="First name" i]')
          .first()
          .fill(input.profile.firstName || "")
          .catch(() => void 0);
        await page
          .locator('input[aria-label*="Last name" i]')
          .first()
          .fill(input.profile.lastName || "")
          .catch(() => void 0);
      }

      await page
        .locator(
          'input[name="_systemfield_email"], input[type="email"], input[aria-label*="Email" i]',
        )
        .first()
        .fill(emailToUse)
        .catch(() => void 0);

      if (phoneToUse) {
        await page
          .locator(
            'input[type="tel"], input[aria-label*="Phone" i], input[name*="phone" i]',
          )
          .first()
          .fill(phoneToUse)
          .catch(() => void 0);
      }

      // LinkedIn URL
      const li = input.profile.links?.find((l) => /linkedin/i.test(l.url));
      if (li) {
        await page
          .locator(
            'input[aria-label*="LinkedIn" i], input[placeholder*="linkedin" i]',
          )
          .first()
          .fill(li.url)
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
        const r = await fillCustomQuestions(page, input.answers);
        if (r.filled > 0) {
          console.log(
            `[ashby] custom questions filled: ${r.filled} (${r.matched.slice(0, 4).join(", ")})`,
          );
        }
      } catch (err) {
        console.warn("[ashby] generic-fill failed", err);
      }

      // GDPR / consent checkbox (rare on Ashby ma presenti su EU companies)
      const consent = page.locator(
        'input[type="checkbox"][name*="consent" i], input[type="checkbox"][name*="gdpr" i], input[type="checkbox"][name*="privacy" i]',
      );
      const cnt = await consent.count();
      for (let i = 0; i < cnt; i++) {
        await consent.nth(i).check({ timeout: 1500 }).catch(() => void 0);
      }

      // Captcha: bloccante SOLO se interattivo (vedi ./captcha.ts). Il badge
      // reCAPTCHA invisibile di Ashby non blocca l'invio.
      const captcha = await detectBlockingCaptcha(page);
      console.log(`[ashby] captcha check: ${captcha.kind ?? "none"} → ${captcha.blocking ? "BLOCCANTE" : "ok"} (${captcha.detail})`);
      if (captcha.blocking) {
        return {
          ok: false,
          status: "captcha",
          error:
            `Il form Ashby ha un captcha interattivo (${captcha.kind}) che blocca l'invio automatico (per design non aggirabile). CV e risposte pronti: completa il captcha e invia manualmente.`,
        };
      }

      if (input.dryRun) {
        return { ok: true, status: "submitted", confirmation: "DRY_RUN" };
      }

      const submit = page.locator(
        'button[type="submit"]:visible, button:visible:has-text("Submit Application"), button:visible:has-text("Submit"), button:visible:has-text("Apply")',
      );
      if ((await submit.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Bottone submit Ashby non trovato.",
        };
      }

      // ============================================================
      // VERIFICA HARD: cattura la risposta HTTP della POST di submission.
      // Ashby invia la candidatura via API (GraphQL `non-user-graphql` op
      // ApplyToJobPosting, o endpoint REST). Lo status code è la verità; il
      // DOM è una conseguenza. NOTA: il GraphQL risponde 200 ANCHE in caso di
      // errore applicativo → dobbiamo ispezionare il body per `"errors"`.
      // Nessuna POST catturata = la validazione client ha bloccato il submit.
      // ============================================================
      const urlBeforeSubmit = page.url();
      const submissionResponsePromise = page
        .waitForResponse(
          (resp) => {
            const u = resp.url().toLowerCase();
            if (resp.request().method().toUpperCase() !== "POST") return false;
            if (!u.includes("ashbyhq.com")) return false;
            return (
              u.includes("graphql") ||
              u.includes("/apply") ||
              u.includes("application") ||
              u.includes("/submit")
            );
          },
          { timeout: 25_000 },
        )
        .catch(() => null);

      await submit.first().click({ timeout: 5_000 });

      const submissionResponse = await submissionResponsePromise;
      await page
        .waitForLoadState("networkidle", { timeout: 12_000 })
        .catch(() => void 0);
      await page.waitForTimeout(800);

      const finalUrl = page.url();
      const bodyText = await page
        .locator("body")
        .innerText()
        .catch(() => "");

      // CASE A: POST catturata → decide da status + (per GraphQL) body.
      if (submissionResponse) {
        const status = submissionResponse.status();
        let respBody = "";
        try {
          respBody = (await submissionResponse.text()).slice(0, 2000);
        } catch {
          /* body già consumato */
        }
        if (status >= 400) {
          return {
            ok: false,
            status: status < 500 ? "validation_failed" : "unknown_error",
            error: `Ashby ha rifiutato la submission (HTTP ${status}). Response: "${respBody.replace(/\s+/g, " ").slice(0, 240)}"`,
          };
        }
        // 2xx/3xx: il GraphQL può avere errori applicativi in un body 200.
        const hasGraphqlError = /"errors"\s*:\s*\[\s*\{/.test(respBody);
        if (hasGraphqlError) {
          return {
            ok: false,
            status: "validation_failed",
            error: `Ashby GraphQL ha risposto 200 ma con errori applicativi: "${respBody.replace(/\s+/g, " ").slice(0, 240)}"`,
          };
        }
        return {
          ok: true,
          status: "submitted",
          confirmation: `DETECTED_HTTP_${status}`,
        };
      }

      // CASE B: nessuna POST → validazione client o thank-you senza request
      // intercettabile. Solo conferma DOM FORTE (no match su testo già
      // presente nel form non inviato) o errore esplicito.
      const errorPatterns =
        /(this\s+field\s+is\s+required|please\s+(correct|fix|enter|complete)|invalid\s+(email|input|file)|campo\s+obbligatorio|inserisci|file\s+too\s+large)/i;
      if (errorPatterns.test(bodyText)) {
        return {
          ok: false,
          status: "validation_failed",
          error: `Validazione client-side ha bloccato il submit Ashby (nessuna POST partita). Body: "${bodyText.slice(0, 200).replace(/\s+/g, " ")}"`,
        };
      }
      const strongConfirmRegex =
        /(thank\s+you\s+for\s+(applying|your)|application\s+(received|submitted|successful)|your\s+application\s+has\s+been|we['’]?ve\s+received\s+your|grazie\s+per\s+(la\s+)?candidatura|candidatura\s+(inviata|ricevuta))/i;
      const urlHasConfirm = /thank|confirm|success|submitted/i.test(finalUrl);
      if (strongConfirmRegex.test(bodyText) || urlHasConfirm) {
        return {
          ok: true,
          status: "submitted",
          confirmation: "DETECTED_DOM",
        };
      }

      if (await challengeAppearedAfterSubmit(page)) {
        return {
          ok: false,
          status: "captcha",
          error: "Dopo il click su Invia si è aperta una challenge reCAPTCHA: completa il captcha e invia manualmente (CV e risposte pronti).",
        };
      }

      return {
        ok: false,
        status: "unknown_error",
        error: `Submit Ashby cliccato ma nessuna conferma rilevata (no POST HTTP, no thank-you, no error banner). URL ${finalUrl !== urlBeforeSubmit ? "cambiato" : "invariato"}: ${finalUrl}.`,
      };
    } catch (err) {
      return {
        ok: false,
        status: "unknown_error",
        error: err instanceof Error ? err.message : "Errore imprevisto Ashby",
      };
    }
  },
};
