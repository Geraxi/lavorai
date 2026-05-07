import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";

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
      // bottone "Attach" o "Upload Resume")
      const cvInput = page.locator('input[type="file"]');
      if ((await cvInput.count()) === 0) {
        return {
          ok: false,
          status: "missing_field",
          error: "Input upload CV non trovato (Ashby).",
        };
      }
      await cvInput.first().setInputFiles(input.cvLocalPath);

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
      await submit.first().click({ timeout: 5_000 });
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => void 0);
      const bodyText = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      const confirmed =
        /thank|applied|submitted|grazie|received|confirm|application received/i.test(
          bodyText,
        ) || /thanks|confirm/i.test(page.url());
      return {
        ok: true,
        status: "submitted",
        confirmation: confirmed ? "DETECTED" : "UNCONFIRMED",
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
