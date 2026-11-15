/**
 * A one-shot intent marker for an application selected directly by its owner.
 *
 * Some ATS hosts are deliberately held for manual completion (for example
 * Ashby, where a CAPTCHA may be present). A direct click should still produce
 * the tailored CV and cover letter, but must never turn that manual hold into
 * an automated submission. The marker lives in `suggestionsJson` only until
 * the worker replaces it with the actual, generated suggestions.
 */
const KIND = "material_preparation_request";
const VERSION = 1;
const EXPLICIT_PORTAL_SUBMISSION_KIND = "explicit_portal_submission_request";

export function materialPreparationRequestJson(): string {
  return JSON.stringify({ kind: KIND, version: VERSION });
}

export function isMaterialPreparationRequested(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return !!parsed && typeof parsed === "object" &&
      (parsed as { kind?: unknown; version?: unknown }).kind === KIND &&
      (parsed as { version?: unknown }).version === VERSION;
  } catch {
    return false;
  }
}

/**
 * A one-shot, user-confirmed instruction to submit a single application via
 * its ATS adapter. This is deliberately separate from the material-prep
 * marker: preparing a CV must never imply consent to send it.
 *
 * The marker is consumed only by the worker handling that exact application.
 * Any CAPTCHA or required answer that is not already stored pauses the run;
 * neither is guessed or bypassed.
 */
export function explicitPortalSubmissionRequestJson(): string {
  return JSON.stringify({ kind: EXPLICIT_PORTAL_SUBMISSION_KIND, version: VERSION });
}

export function isExplicitPortalSubmissionRequested(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return !!parsed && typeof parsed === "object" &&
      (parsed as { kind?: unknown; version?: unknown }).kind === EXPLICIT_PORTAL_SUBMISSION_KIND &&
      (parsed as { version?: unknown }).version === VERSION;
  } catch {
    return false;
  }
}
