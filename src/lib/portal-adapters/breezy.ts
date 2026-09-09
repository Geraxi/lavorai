import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
import { applyOnPublicForm } from "./web-form";

/**
 * Breezy HR — <slug>.breezy.hr/p/<id>[/apply]. Form pubblico con
 * nome completo, email, telefono, CV (input file) e cover letter.
 */
export const breezyAdapter: PortalAdapter = {
  id: "breezy",
  label: "Breezy HR",
  matches(url: string): boolean {
    try { return /(^|\.)breezy\.hr$/i.test(new URL(url).hostname); } catch { return false; }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
    return applyOnPublicForm(page, input, {
      id: "breezy",
      tag: "[breezy]",
      hostRe: /breezy\.hr/i,
      formUrl: (u) => (u.replace(/\/+$/, "").endsWith("/apply") ? u : `${u.replace(/\/+$/, "")}/apply`),
      fields: {
        fullName: ['input[name="name"]', "input#name", 'input[placeholder*="name" i]'],
        firstName: ['input[name="first_name"]', 'input[name*="first" i]'],
        lastName: ['input[name="last_name"]', 'input[name*="last" i]'],
        email: ['input[name="email"]', 'input[type="email"]'],
        phone: ['input[name="phone_number"]', 'input[name="phone"]', 'input[type="tel"]'],
        coverLetter: ['textarea[name="cover_letter"]', 'textarea[name*="cover" i]', "textarea"],
        linkedin: ['input[name*="linkedin" i]'],
      },
      submitRe: /submit application|submit|apply|invia|candidati/i,
    });
  },
};
