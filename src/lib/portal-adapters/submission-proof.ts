import { receiptJobId as submissionJobId } from "../submission-receipt";
export { receiptJobId as submissionJobId } from "../submission-receipt";
import type { Page, Request, Response } from "playwright";
import type { ApplyOutcome, CanaryLog, SubmissionReceipt } from "./types";
import { challengeAppearedAfterSubmit, detectBlockingCaptcha } from "./captcha";
import { captureSubmitEvidence } from "./submit-evidence";
import { SECURITY_CODE_FIELD } from "../application-security-code";
import {
  emptyAttemptEvidence,
  type OutboundSubmissionEvidence,
  type SubmissionAttemptEvidence,
} from "./submission-attempt-evidence";

/** A status code is transport evidence, never proof that an application exists. */
export interface SubmissionRequest {
  url: string;
  method: string;
  postData: string | null;
}
export interface SubmissionResponse extends SubmissionRequest {
  status: number;
  body: string | null;
}
export interface PageReceiptSnapshot {
  url: string;
  receiptText: string;
  formVisible: boolean;
  readable: boolean;
}
interface RequestProof { jobId: string; operation: string; responseKeys?: string[] }

const HOSTS: Record<string, RegExp> = {
  ashby: /(^|\.)ashbyhq\.com$/i,
  greenhouse: /(^|\.)greenhouse\.io$/i,
  lever: /(^|\.)lever\.co$/i,
  workable: /(^|\.)workable\.com$/i,
  recruitee: /(^|\.)recruitee\.com$/i,
  personio: /(^|\.)personio\.(de|com)$/i,
  teamtailor: /(^|\.)teamtailor\.com$/i,
  bamboohr: /(^|\.)bamboohr\.com$/i,
  breezy: /(^|\.)breezy\.hr$/i,
  pinpoint: /(^|\.)pinpointhq\.com$/i,
  smartrecruiters: /(^|\.)smartrecruiters\.com$/i,
};
const CUSTOM_HOST_PROVIDERS = new Set(["teamtailor", "recruitee"]);
const RECEIPT_TEXT = /\b(?:thank you for (?:applying|your application)|your application (?:has been |was )?(?:successfully )?(?:received|submitted|sent)|we(?:'ve| have)? received your application|application (?:successfully )?(?:received|submitted)|grazie per (?:la tua |la sua |la )?candidatura|(?:la tua |la sua )?candidatura (?:è stata )?(?:inviata|ricevuta))\b/i;
const NEGATIVE_RECEIPT_TEXT = /\b(?:not|never|unable|failed|error|could not|non|errore|if|once|after|when)\b/i;
const ASHBY_OPERATIONS: Record<string, string[]> = {
  applytojobposting: ["applyToJobPosting", "ApplyToJobPosting"],
  jobboardapplicationformsubmit: ["jobBoardApplicationFormSubmit", "JobBoardApplicationFormSubmit"],
  apijobboardapplicationformsubmit: ["jobBoardApplicationFormSubmit", "apiJobBoardApplicationFormSubmit", "ApiJobBoardApplicationFormSubmit"],
  // The mutation the public jobs.ashbyhq.com form actually sends (verified in
  // the live frontend bundle, Oct 2026). Without it no Ashby click could ever
  // produce an HTTP receipt, so every real submit ended as UNCONFIRMED.
  apisubmitsingleapplicationformaction: ["submitSingleApplicationFormAction"],
  apisubmitapplicationformaction: ["submitApplicationFormAction"],
};
/** Ashby form-action result: FormSubmitSuccess is the server's definitive
 * acceptance; FormRender means the form came back (validation errors). */
function ashbyFormActionResult(result: unknown): "success" | "rejected" | null {
  const record = asRecord(result);
  const form = asRecord(record?.applicationFormResult);
  if (!record || !form) return null;
  const block = asRecord(record.messages)?.blockMessageForCandidateHtml;
  if (typeof block === "string" && block.trim()) return "rejected";
  if (form.__typename === "FormSubmitSuccess") return "success";
  return "rejected";
}
function ashbyRequestId(postData: string | null): string | undefined {
  const variables = asRecord(asRecord(parseJson(postData))?.variables);
  return safeIdentifier(variables?.applicationRequestId);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function parseJson(text: string | null): unknown {
  if (!text || text.length > 256_000) return null;
  try { return JSON.parse(text); } catch { return null; }
}
function safeIdentifier(value: unknown): string | undefined {
  return (typeof value === "string" || typeof value === "number") && /^[\w-]{1,160}$/.test(String(value)) ? String(value) : undefined;
}
function trustedUrl(provider: string, raw: string, jobUrl: string): boolean {
  try {
    const url = new URL(raw), job = new URL(jobUrl);
    if (url.protocol !== "https:" || job.protocol !== "https:" || url.username || url.password || job.username || job.password) return false;
    return !!HOSTS[provider]?.test(url.hostname) || (CUSTOM_HOST_PROVIDERS.has(provider) && url.hostname === job.hostname);
  } catch { return false; }
}
function normalizedJob(value: unknown): string {
  return String(value ?? "");
}
function payloadHasJob(value: unknown, jobId: string, depth = 0): boolean {
  if (depth > 8) return false;
  if (Array.isArray(value)) return value.some((item) => payloadHasJob(item, jobId, depth + 1));
  const record = asRecord(value);
  if (!record) return false;
  return Object.entries(record).some(([key, v]) => {
    const jobKey = /^(?:job(?:posting|post|offer)?(?:id|shortcode)?|postingid|offerid|offerslug|positionid|gh_jid)$/i.test(key.replace(/[_\-\[\]]/g, ""));
    return (jobKey && normalizedJob(v) === normalizedJob(jobId)) || payloadHasJob(v, jobId, depth + 1);
  });
}
function parsePayload(text: string | null): unknown {
  const json = parseJson(text);
  if (json) return json;
  if (!text || text.length > 256_000) return null;
  // URL-encoded forms only. Multipart must prove its job in the endpoint;
  // never look for an arbitrary ID somewhere in the candidate's CV or text.
  if (text.includes("Content-Disposition:")) return null;
  return Object.fromEntries(new URLSearchParams(text));
}
function endpointJobId(provider: string, path: string): string | null {
  const patterns: Record<string, RegExp> = {
    greenhouse: /\/jobs\/(\d+)(?:\/|$)/,
    lever: /^\/[^/]+\/([^/]+)\/(?:apply|application)$/,
    workable: /\/jobs\/([^/]+)\/(?:apply|applications|candidates)$/,
    recruitee: /\/api\/offers\/([^/]+)\/candidates$/,
    personio: /\/job\/(\d+)\/(?:apply|application)$/,
    teamtailor: /\/jobs\/(\d+)(?:-[^/]*)?\/applications$/,
    bamboohr: /\/careers\/(\d+)\/(?:apply|applications)$/,
    breezy: /\/p\/([^/]+)\/(?:apply|applications)$/,
    pinpoint: /\/postings\/([^/]+)\/applications$/,
    smartrecruiters: /\/postings\/([^/]+)\/(?:candidates|applications)$/,
  };
  return path.match(patterns[provider] ?? /$^/)?.[1] ?? null;
}

/** Only known application writes for the requested job are eligible. */
export function matchSubmissionRequest(provider: string, jobUrl: string, request: SubmissionRequest): RequestProof | null {
  if (request.method.toUpperCase() !== "POST" || !trustedUrl(provider, request.url, jobUrl)) return null;
  const jobId = submissionJobId(provider, jobUrl);
  if (!jobId) return null;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const payload = parsePayload(request.postData);
  if (provider === "ashby") {
    if (!/^\/(?:non-user-graphql|api\/non-user-graphql|graphql)$/.test(path)) return null;
    const record = asRecord(payload);
    const operation = typeof record?.operationName === "string" ? record.operationName : url.searchParams.get("op");
    const responseKeys = ASHBY_OPERATIONS[(operation ?? "").toLowerCase()];
    if (!operation || !responseKeys || !payloadHasJob(record?.variables, jobId)) return null;
    // Queries and mixed/batched requests cannot masquerade as a submission.
    if (record?.query) {
      if (typeof record.query !== "string" || !/^\s*mutation\b/.test(record.query)) return null;
      const selection = record.query.slice(record.query.indexOf("{") + 1);
      const root = new RegExp(`^\\s*(?:[a-zA-Z_][a-zA-Z_0-9]*\\s*:\\s*)?(?:${responseKeys.join("|")})\\s*[({]`);
      if (!root.test(selection)) return null;
    }
    return { jobId, operation, responseKeys };
  }
  const endpoints: Record<string, RegExp> = {
    greenhouse: /\/(?:jobs\/\d+(?:\/applications)?|job_app\/submit|job_applications?|applications|forms\/jobs\/\d+)$/i,
    lever: /^\/[^/]+\/[^/]+\/(?:apply|application)$/i,
    workable: /\/(?:jobs\/[^/]+\/(?:apply|applications|candidates)|applications)$/i,
    recruitee: /\/api\/offers\/[^/]+\/candidates$/i,
    personio: /\/(?:job\/\d+\/(?:apply|application)|recruiting\/job\/\d+\/apply|applications)$/i,
    teamtailor: /\/(?:jobs\/[^/]+\/applications|applications)$/i,
    bamboohr: /\/(?:careers\/\d+\/(?:apply|applications)|careers\/apply|applicant_tracking\/application)$/i,
    breezy: /\/p\/[^/]+\/(?:apply|applications)$/i,
    pinpoint: /\/postings\/[^/]+\/applications$/i,
    smartrecruiters: /\/(?:postings\/[^/]+\/(?:candidates|applications)|applications)$/i,
  };
  if (!endpoints[provider]?.test(path)) return null;
  const queryJob = payloadHasJob(Object.fromEntries(url.searchParams), jobId);
  const pathJobId = endpointJobId(provider, path);
  if (pathJobId !== null ? pathJobId !== jobId : !payloadHasJob(payload, jobId) && !queryJob) return null;
  return { jobId, operation: "application.create" };
}
function hasApplicationError(value: unknown, depth = 0): boolean {
  if (depth > 12) return true;
  if (Array.isArray(value)) return value.some((v) => hasApplicationError(v, depth + 1));
  const obj = asRecord(value);
  if (!obj) return false;
  return Object.entries(obj).some(([key, v]) => {
    if (/^(?:errors?|validationErrors|fieldErrors|formErrors|userErrors|errorMessages?)$/i.test(key)) {
      if (Array.isArray(v)) return v.length > 0;
      if (asRecord(v)) return Object.keys(v as object).length > 0;
      return v !== false && v != null && v !== "";
    }
    if (/^(?:success|ok|accepted|submitted)$/i.test(key) && v === false) return true;
    if (/^(?:status|state|type|code|__typename)$/i.test(key) && typeof v === "string" && /error|fail|invalid|reject|duplicate|pending|draft|incomplete|unsubmitted|not.?submitted|awaiting|queued|challenge|verification|captcha/i.test(v)) return true;
    if (/(?:requires?|needs?).*(?:verification|security.?code|captcha|challenge)|(?:verification|security.?code|captcha|challenge).*required/i.test(key) && v !== false && v != null && v !== "") return true;
    if (key === "message" && typeof v === "string" && /(?:verify|confirm).*(?:email|identity)|security code|captcha|verification required/i.test(v)) return true;
    return hasApplicationError(v, depth + 1);
  });
}
function successSignal(value: unknown, provider: string): { signal: string; receiptId?: string } | null {
  const record = asRecord(value);
  if (!record) return null;
  const application = asRecord(record.application);
  const candidate = provider === "recruitee" ? asRecord(record.candidate) : null;
  const receiptId = safeIdentifier(record.applicationId ?? record.jobApplicationId ?? record.application_id ?? application?.id ?? candidate?.id);
  if (receiptId) return { signal: "application_id", receiptId };
  if (record.success === true || record.submitted === true || record.accepted === true) return { signal: "application_accepted" };
  if (typeof record.message === "string" && RECEIPT_TEXT.test(record.message) && !NEGATIVE_RECEIPT_TEXT.test(record.message)) return { signal: "application_receipt_message" };
  return null;
}
export function verifySubmissionResponse(provider: string, jobUrl: string, response: SubmissionResponse): { receipt?: SubmissionReceipt; rejected: boolean } {
  const proof = matchSubmissionRequest(provider, jobUrl, response);
  if (!proof) return { rejected: false };
  // 4xx is explicit rejection without acceptance. 5xx after a write is
  // ambiguous (the destination may have processed the request).
  if (response.status >= 400 && response.status < 500) return { rejected: true };
  if (response.status < 200 || response.status >= 300) return { rejected: false };
  const body = parseJson(response.body);
  if (!body) return { rejected: false };
  if (hasApplicationError(body)) return { rejected: true };
  let result: unknown = body;
  if (proof.responseKeys) {
    const data = asRecord(asRecord(body)?.data);
    result = proof.responseKeys.map((key) => data?.[key]).find((v) => v != null);
  }
  let success = successSignal(result, provider);
  if (provider === "ashby") {
    const form = ashbyFormActionResult(result);
    if (form === "rejected") return { rejected: true };
    if (form === "success") {
      const receiptId = ashbyRequestId(response.postData);
      success = receiptId ? { signal: "form_submit_success", receiptId } : { signal: "form_submit_success" };
    }
  }
  if (!success) return { rejected: false };
  // Endpoint only, no query strings, tokens, request payload or response text.
  const endpoint = new URL(response.url);
  return { rejected: false, receipt: {
    version: 1, provider, kind: "http", capturedAt: new Date().toISOString(),
    jobId: proof.jobId, endpoint: `${endpoint.origin}${endpoint.pathname}`,
    operation: proof.operation, httpStatus: response.status, ...success,
  } };
}
export function verifyPageReceipt(provider: string, jobUrl: string, before: PageReceiptSnapshot, after: PageReceiptSnapshot): SubmissionReceipt | null {
  const jobId = submissionJobId(provider, jobUrl);
  if (!jobId || !before.readable || !after.readable || !before.formVisible || after.formVisible) return null;
  if (!trustedUrl(provider, before.url, jobUrl) || !trustedUrl(provider, after.url, jobUrl)) return null;
  if (submissionJobId(provider, before.url) !== jobId) return null;
  const afterJobId = submissionJobId(provider, after.url);
  // Success paths can drop the job id, but cannot switch to another job.
  if (afterJobId && afterJobId !== jobId) return null;
  if (RECEIPT_TEXT.test(before.receiptText) || !RECEIPT_TEXT.test(after.receiptText) || NEGATIVE_RECEIPT_TEXT.test(after.receiptText)) return null;
  return { version: 1, provider, kind: "dom", capturedAt: new Date().toISOString(), jobId, signal: "new_receipt_and_form_removed" };
}
async function snapshotPage(page: Page): Promise<PageReceiptSnapshot> {
  const url = page.url();
  try {
    // A scoped visible receipt, not arbitrary prose in the job description.
    const snapshot = await page.evaluate(`(() => {
      const visible = (e) => !!(e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      const receiptText = Array.from(document.querySelectorAll('h1, h2, h3, [role="status"], [data-testid*="confirmation" i], [data-testid*="success" i], .application-confirmation, #application-confirmation')).filter(visible).map(e => e.innerText || e.textContent || '').join('\\n').slice(0, 8000);
      const formVisible = Array.from(document.querySelectorAll('input[type="email"], input[name*="email" i], input[type="file"], input[autocomplete="one-time-code"], textarea[name*="cover" i]')).some(visible);
      return { receiptText, formVisible, readable: true };
    })()`) as Omit<PageReceiptSnapshot, "url">;
    return { url, ...snapshot };
  } catch { return { url, receiptText: "", formVisible: true, readable: false }; }
}
async function boundedResponseBody(response: Response): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.text().then((body) => body.length <= 256_000 ? body : null).catch(() => null),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 5_000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export interface ObservedSubmission {
  outcome: ApplyOutcome;
  response: SubmissionResponse | null;
}

export interface ObserveSubmissionOptions {
  applicationId?: string;
}

function withCanary(outcome: ApplyOutcome, canary: CanaryLog | undefined): ApplyOutcome {
  return canary ? { ...outcome, canary } : outcome;
}

/** Observe only requests STARTED in this click's window; never click twice. */
export async function observeSubmission(page: Page, provider: string, jobUrl: string, click: () => Promise<unknown>, beforeSubmit?: () => Promise<boolean>, opts?: ObserveSubmissionOptions): Promise<ObservedSubmission> {
  const before = await snapshotPage(page);
  const initialCaptcha = await detectBlockingCaptcha(page);
  if (initialCaptcha.blocking) {
    return {
      response: null,
      outcome: {
        ok: false,
        status: "captcha",
        error: "Il portale richiede un captcha interattivo. Completa la verifica manualmente prima di procedere.",
        attemptEvidence: emptyAttemptEvidence(),
      },
    };
  }
  const started = new Set<Request>();
  const responses: SubmissionResponse[] = [];
  const pending: Promise<void>[] = [];
  let outboundRequest: OutboundSubmissionEvidence | null = null;
  const onRequest = (request: Request) => {
    try {
      const proof = matchSubmissionRequest(provider, jobUrl, { url: request.url(), method: request.method(), postData: request.postData() });
      if (!proof) return;
      started.add(request);
      const endpoint = new URL(request.url());
      outboundRequest = {
        capturedAt: new Date().toISOString(),
        provider,
        jobId: proof.jobId,
        endpoint: `${endpoint.origin}${endpoint.pathname}`,
        operation: proof.operation,
        method: request.method(),
      };
    } catch { /* an unreadable request is not proof */ }
  };
  const onResponse = (response: Response) => {
    if (!started.has(response.request())) return;
    const request = response.request();
    pending.push((async () => {
      const body = await boundedResponseBody(response);
      responses.push({ url: response.url(), method: request.method(), postData: request.postData(), status: response.status(), body });
    })());
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  let clickPerformed = false;
  let clickPerformedAt: string | undefined;
  try {
    if (beforeSubmit && !(await beforeSubmit().catch(() => false))) {
      return { response: null, outcome: { ok: false, status: "submission_unconfirmed", error: "Invio bloccato: le condizioni o le autorizzazioni della candidatura sono cambiate. Nessun nuovo invio eseguito.", attemptEvidence: emptyAttemptEvidence() } };
    }
    // A timeout after dispatch is ambiguous, so never force-click/replay it.
    await click().catch(() => void 0);
    clickPerformed = true;
    clickPerformedAt = new Date().toISOString();
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => void 0);
    await page.waitForTimeout(1_200);
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
  await Promise.all(pending);
  const after = await snapshotPage(page);
  const response = responses.at(-1) ?? null;
  const canary = await captureSubmitEvidence(page, responses, {
    applicationId: opts?.applicationId,
    urlBeforeSubmit: before.url,
  }).catch(() => undefined);
  const proofs = responses.map((r) => verifySubmissionResponse(provider, jobUrl, r));
  const receipt = proofs.some((r) => r.rejected)
    ? undefined
    : proofs.find((r) => r.receipt)?.receipt ?? verifyPageReceipt(provider, jobUrl, before, after);
  const rejected = proofs.some((r) => r.rejected);
  const attemptEvidence: SubmissionAttemptEvidence = {
    version: 1,
    clickPerformed,
    clickPerformedAt,
    outboundRequest,
    destinationResponse: response
      ? {
          capturedAt: new Date().toISOString(),
          httpStatus: response.status,
          rejected,
          ambiguous: !rejected && !receipt,
          signal: receipt?.signal,
          receiptId: receipt?.receiptId,
        }
      : outboundRequest
        ? { capturedAt: outboundRequest.capturedAt, rejected: false, ambiguous: true }
        : null,
  };
  const withEvidence = (outcome: ObservedSubmission["outcome"]): ObservedSubmission => ({
    response,
    outcome: withCanary({ ...outcome, attemptEvidence }, canary),
  });
  const codeVisible = await page.locator(SECURITY_CODE_FIELD).first().isVisible().catch(() => false);
  // Explicit 4xx / body validation with no acceptance: rejected-not-sent.
  if (rejected && !receipt) {
    return withEvidence({
      ok: false,
      status: "validation_failed",
      error: `Il portale ${provider} ha rifiutato la candidatura (validazione). Nessun invio accettato.`,
    });
  }
  // A security-code prompt is not destination acceptance, even if the POST
  // returned an identifier for a draft / pending verification.
  if (codeVisible) {
    return withEvidence({
      ok: false,
      status: "submission_unconfirmed",
      error: "Il portale richiede una verifica prima di confermare la ricezione. Non reinviare automaticamente la candidatura.",
    });
  }
  if (receipt) {
    return withEvidence({
      ok: true,
      status: "submitted",
      confirmation: receipt.kind === "http" ? `DETECTED_HTTP_${receipt.httpStatus}` : "DETECTED_DOM",
      receipt,
    });
  }
  // After a click or an outgoing POST, a challenge / timeout / missing
  // response stays uncertain. Only a visible challenge with no outbound
  // request is CAPTCHA (nothing crossed the form endpoint).
  const challengeAfterClick = await challengeAppearedAfterSubmit(page);
  if (response || outboundRequest) {
    return withEvidence({
      ok: false,
      status: "submission_unconfirmed",
      error: `Invio ${provider} tentato, ma manca una ricevuta verificabile per questo annuncio. Verifica la ricezione prima di riprovare per evitare duplicati.`,
    });
  }
  if (challengeAfterClick) {
    return withEvidence({
      ok: false,
      status: "captcha",
      error: "Il portale richiede una verifica prima di confermare la ricezione. Non reinviare automaticamente la candidatura.",
    });
  }
  return withEvidence({
    ok: false,
    status: "submission_unconfirmed",
    error: `Invio ${provider} tentato, ma manca una ricevuta verificabile per questo annuncio. Verifica la ricezione prima di riprovare per evitare duplicati.`,
  });
}
