import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
import { applyOnPublicForm } from "./web-form";

/**
 * BambooHR — <tenant>.bamboohr.com/careers/<id>.
 * La pagina annuncio contiene il form pubblico: firstName, lastName, email,
 * phone, resume (file), eventuali domande, consensi. Submit "Submit Application".
 */
const HOSTS = [/(^|\.)bamboohr\.com$/i];

export const bamboohrAdapter: PortalAdapter = {
  id: "bamboohr",
  label: "BambooHR",
  matches(url: string): boolean {
    try { const u = new URL(url); return HOSTS.some((re) => re.test(u.hostname)) && /\/careers\/\d+/.test(u.pathname); } catch { return false; }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
    return applyOnPublicForm(page, input, {
      id: "bamboohr",
      tag: "[bamboohr]",
      hostRe: /bamboohr\.com/i,
      openForm: async (p) => {
        const btn = p.getByRole("button", { name: /apply for this job|apply now|apply/i }).or(p.getByRole("link", { name: /apply for this job|apply now|apply/i })).first();
        if ((await btn.count().catch(() => 0)) > 0) { await btn.click({ timeout: 3000 }).catch(() => void 0); return true; }
        return false;
      },
      fields: {
        firstName: ["input#firstName", 'input[name="firstName"]', 'input[name*="first" i]', 'input[autocomplete="given-name"]'],
        lastName: ["input#lastName", 'input[name="lastName"]', 'input[name*="last" i]', 'input[autocomplete="family-name"]'],
        email: ["input#email", 'input[name="email"]', 'input[type="email"]'],
        phone: ["input#phone", 'input[name="phone"]', 'input[type="tel"]'],
        coverLetter: ['textarea[name*="cover" i]', "textarea#coverLetter"],
        linkedin: ['input[name*="linkedin" i]', "input#linkedinUrl"],
      },
      submitRe: /submit application|submit|apply|invia/i,
    });
  },
};
