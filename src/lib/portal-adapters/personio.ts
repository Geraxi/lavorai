import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
import { applyOnPublicForm } from "./web-form";
import { preferredApplyUrl } from "./form-probe";

/**
 * Personio — <tenant>.jobs.personio.de/job/<id> (o .com).
 * The public apply form lives at `/job/<id>/apply` (SSR). The `#apply` hash
 * alone does NOT mount the form inputs — probing that URL caused form_not_found
 * on postings like impower.jobs.personio.com/job/2879528#apply.
 */
const HOSTS = [/(^|\.)jobs\.personio\.(de|com)$/i];

function personioFormUrl(jobUrl: string): string {
  return preferredApplyUrl("personio", jobUrl, "");
}

export const personioAdapter: PortalAdapter = {
  id: "personio",
  label: "Personio",
  matches(url: string): boolean {
    try { return HOSTS.some((re) => re.test(new URL(url).hostname)); } catch { return false; }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
    return applyOnPublicForm(page, input, {
      id: "personio",
      tag: "[personio]",
      hostRe: /personio\.(de|com)/i,
      formUrl: personioFormUrl,
      openForm: async (p) => {
        const emailField = await p.locator('input[name="email"], input#email, input[type="email"], input#field-email').count().catch(() => 0);
        if (emailField > 0) return true;

        const btn = p.getByRole("link", { name: /apply|candidati|bewerben|postuler|aplicar/i })
          .or(p.getByRole("button", { name: /apply|candidati|bewerben|postuler|aplicar/i })).first();
        if ((await btn.count().catch(() => 0)) > 0) {
          await btn.click({ timeout: 3000 }).catch(() => void 0);
          await p.waitForTimeout(1200);
          return true;
        }

        const applyTrigger = p.locator('[data-apply], [data-action="apply"], a[href*="/apply"]').first();
        if ((await applyTrigger.count().catch(() => 0)) > 0) {
          await applyTrigger.click({ timeout: 3000 }).catch(() => void 0);
          await p.waitForTimeout(1200);
          return true;
        }
        return false;
      },
      fields: {
        firstName: ['input[name="first_name"]', "input#first_name", "input#field-first_name", 'input[name*="first" i]', 'input[autocomplete="given-name"]'],
        lastName: ['input[name="last_name"]', "input#last_name", "input#field-last_name", 'input[name*="last" i]', 'input[autocomplete="family-name"]'],
        email: ['input[name="email"]', "input#email", "input#field-email", 'input[type="email"]'],
        phone: ['input[name="phone"]', "input#phone", "input#field-phone", 'input[type="tel"]'],
        coverLetter: ['textarea[name*="cover" i]', 'textarea[name*="message" i]', 'textarea[name*="motiv" i]'],
        linkedin: ['input[name*="linkedin" i]'],
      },
      submitRe: /apply|candidati|invia|submit|bewerb|send|postuler|enviar/i,
    });
  },
};
