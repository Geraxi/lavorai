import type { Page } from "playwright";
import type { ApplyInput, ApplyOutcome } from "./types";
import { pageSafetyStop, type SafetyScan } from "./safety-stops";
import { isClosedPostingBanner, isClosedPostingUrl, PageProgressTracker } from "./stuck-page";
import { expectedFieldsFrom, verifyFilledFields } from "./pre-submit-verify";

async function regionText(page: Page, selector: string): Promise<string> {
  try {
    const loc = page.locator(selector);
    const n = await loc.count().catch(() => 0);
    if (!n) return "";
    const first = loc.first();
    const text = await first.innerText();
    return (text ?? "").slice(0, 4_000);
  } catch {
    return "";
  }
}

/** Form / dialog / banner / title only — never the job-description body. */
export async function collectSafetyScan(page: Page): Promise<SafetyScan & { bannerText: string; title: string }> {
  const url = page.url();
  const [formText, dialogText, heading, alert, title] = await Promise.all([
    regionText(page, "form, [role='form']"),
    regionText(page, "[role='dialog'], [role='alertdialog'], [aria-modal='true']"),
    regionText(page, "h1"),
    regionText(page, "[role='alert']"),
    Promise.resolve().then(() => page.title()).catch(() => ""),
  ]);
  return {
    url,
    formText,
    dialogText,
    bannerText: [heading, alert].filter(Boolean).join("\n"),
    title: title ?? "",
  };
}

export async function inspectLivePage(page: Page, tracker?: PageProgressTracker): Promise<ApplyOutcome | null> {
  const url = page.url();
  if (tracker?.note(url) === "stuck") {
    return { ok: false, status: "stuck", error: "Same page after 3 attempts with no progress. Nothing was sent." };
  }
  const scan = await collectSafetyScan(page);
  if (isClosedPostingUrl(scan.url) || isClosedPostingBanner(scan.title) || isClosedPostingBanner(scan.bannerText)) {
    return { ok: false, status: "job_closed", error: "Annuncio non più online." };
  }
  const stop = pageSafetyStop(scan);
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
