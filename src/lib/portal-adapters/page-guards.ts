import type { Page } from "playwright";
import type { ApplyInput, ApplyOutcome } from "./types";
import { pageSafetyStop } from "./safety-stops";
import { isClosedPostingText, PageProgressTracker } from "./stuck-page";
import { expectedFieldsFrom, verifyFilledFields } from "./pre-submit-verify";

export async function inspectLivePage(page: Page, tracker?: PageProgressTracker): Promise<ApplyOutcome | null> {
  const url = page.url();
  if (tracker?.note(url) === "stuck") {
    return { ok: false, status: "stuck", error: "Same page after 3 attempts with no progress. Nothing was sent." };
  }
  let body = "";
  try {
    const text = await page.locator("body").innerText();
    body = (text ?? "").slice(0, 8_000);
  } catch {
    body = "";
  }
  if (isClosedPostingText(body)) {
    return { ok: false, status: "job_closed", error: "Annuncio non più online." };
  }
  const stop = pageSafetyStop(url, body);
  if (!stop) return null;
  const status = stop.outcome === "LOGIN_REQUIRED" ? "login_required"
    : stop.outcome === "NOT_ELIGIBLE" ? "not_eligible"
    : stop.outcome === "FAILED:marketplace" ? "marketplace"
    : stop.outcome === "FAILED:sso_required" ? "sso_required"
    : stop.outcome === "FAILED:id_verification" ? "id_verification"
    : stop.outcome === "FAILED:not_a_job_application" ? "not_a_job_application"
    : "unsafe_permissions";
  return { ok: false, status, error: stop.error };
}

export async function abortIfFieldsWrong(page: Page, input: ApplyInput, resumeUploaded = true): Promise<ApplyOutcome | null> {
  const result = await verifyFilledFields(page, expectedFieldsFrom({
    profile: input.profile,
    userEmail: input.userEmail,
    userPhone: input.userPhone,
    coverLetterText: input.coverLetterText,
    resumeUploaded,
    answers: input.answers,
  }));
  if (result.ok) return null;
  return {
    ok: false,
    status: "needs_user_input",
    error: `Pre-submit check failed (${result.missing.join(", ")}). Nothing was submitted.`,
    pendingQuestions: result.missing.map((label) => ({ label, kind: "text" })),
  };
}
