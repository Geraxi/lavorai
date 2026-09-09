import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
import { applyOnPublicForm } from "./web-form";

/**
 * Personio — <tenant>.jobs.personio.de/job/<id> (o .com).
 * La pagina annuncio ha un bottone "Apply for this position"/"Candidati"
 * che apre il form pubblico in pagina: first_name, last_name, email, CV.
 */
const HOSTS = [/(^|\.)jobs\.personio\.(de|com)$/i];

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
      formUrl: (u) => (u.includes("#") ? u : `${u}#apply`),
      openForm: async (p) => {
        const btn = p.getByRole("link", { name: /apply|candidati|bewerben|postuler|aplicar/i }).or(p.getByRole("button", { name: /apply|candidati|bewerben|postuler|aplicar/i })).first();
        if ((await btn.count().catch(() => 0)) > 0) { await btn.click({ timeout: 3000 }).catch(() => void 0); return true; }
        return false;
      },
      fields: {
        firstName: ['input[name="first_name"]', "input#first_name", 'input[name*="first" i]', 'input[autocomplete="given-name"]'],
        lastName: ['input[name="last_name"]', "input#last_name", 'input[name*="last" i]', 'input[autocomplete="family-name"]'],
        email: ['input[name="email"]', "input#email", 'input[type="email"]'],
        phone: ['input[name="phone"]', "input#phone", 'input[type="tel"]'],
        coverLetter: ['textarea[name*="cover" i]', 'textarea[name*="message" i]', 'textarea[name*="motiv" i]'],
        linkedin: ['input[name*="linkedin" i]'],
      },
      submitRe: /apply|candidati|invia|submit|bewerb|send|postuler|enviar/i,
    });
  },
};
