import type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
import { applyOnPublicForm } from "./web-form";

/**
 * Pinpoint — <slug>.pinpointhq.com/postings/<id>. Il form pubblico è su
 * /postings/<id>/applications/new (first/last name, email, phone, CV).
 */
export const pinpointAdapter: PortalAdapter = {
  id: "pinpoint",
  label: "Pinpoint",
  matches(url: string): boolean {
    try { return /(^|\.)pinpointhq\.com$/i.test(new URL(url).hostname); } catch { return false; }
  },
  async apply(page, input: ApplyInput): Promise<ApplyOutcome> {
    return applyOnPublicForm(page, input, {
      id: "pinpoint",
      tag: "[pinpoint]",
      hostRe: /pinpointhq\.com/i,
      formUrl: (u) => (/\/applications\/new/.test(u) ? u : `${u.replace(/\/+$/, "")}/applications/new`),
      fields: {
        firstName: ['input[name*="first_name" i]', 'input[id*="first_name" i]', 'input[autocomplete="given-name"]'],
        lastName: ['input[name*="last_name" i]', 'input[id*="last_name" i]', 'input[autocomplete="family-name"]'],
        email: ['input[name*="email" i]', 'input[type="email"]'],
        phone: ['input[name*="phone" i]', 'input[type="tel"]'],
        coverLetter: ['textarea[name*="cover" i]', 'textarea[name*="message" i]'],
        linkedin: ['input[name*="linkedin" i]'],
      },
      submitRe: /submit application|submit|apply|invia|candidati/i,
    });
  },
};
