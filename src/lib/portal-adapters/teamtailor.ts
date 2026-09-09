import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
import { applyOnPublicForm } from "./web-form";

/**
 * Teamtailor — <tenant>.teamtailor.com/jobs/<id>-slug (o dominio custom).
 * Il form pubblico è su <job>/applications/new: name/first+last, email,
 * telefono, CV, consenso privacy, eventuali domande custom.
 */
const HOST_RE = /(^|\.)teamtailor\.com$/i;
const PATH_RE = /\/jobs\/\d+[^/]*(\/applications\/new)?\/?$/i;

export const teamtailorAdapter: PortalAdapter = {
  id: "teamtailor",
  label: "Teamtailor",
  matches(url: string): boolean {
    try {
      const u = new URL(url);
      return HOST_RE.test(u.hostname) || (/career|jobs|lavora/i.test(u.hostname) && PATH_RE.test(u.pathname) && /\/jobs\/\d+/.test(u.pathname));
    } catch { return false; }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
    return applyOnPublicForm(page, input, {
      id: "teamtailor",
      tag: "[teamtailor]",
      hostRe: /teamtailor\.com|\/jobs\/\d+/i,
      formUrl: (u) => (/\/applications\/new/.test(u) ? u : `${u.replace(/\/$/, "")}/applications/new`),
      fields: {
        firstName: ['input[name="candidate[first_name]"]', 'input[name*="first_name" i]', 'input[autocomplete="given-name"]'],
        lastName: ['input[name="candidate[last_name]"]', 'input[name*="last_name" i]', 'input[autocomplete="family-name"]'],
        fullName: ['input[name="candidate[name]"]', 'input[name="name"]', 'input[autocomplete="name"]'],
        email: ['input[name="candidate[email]"]', 'input[type="email"]', 'input[name*="email" i]'],
        phone: ['input[name="candidate[phone]"]', 'input[type="tel"]', 'input[name*="phone" i]'],
        coverLetter: ['textarea[name*="cover" i]', 'textarea[name*="letter" i]', 'textarea[name*="message" i]'],
        linkedin: ['input[name*="linkedin" i]'],
      },
      submitRe: /submit|send|apply|invia|candidati|skicka|ansök|envoyer/i,
    });
  },
};
