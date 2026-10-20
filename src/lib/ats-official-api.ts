/**
 * Official employer ATS APIs (Ashby `applicationForm.submit`, Greenhouse Job
 * Board API `POST /v1/boards/{board}/jobs/{id}`).
 *
 * Both endpoints authenticate with the EMPLOYER's own API key (HTTP Basic):
 *   - Ashby: an API key of the hiring organisation with `candidatesWrite`.
 *   - Greenhouse: the hiring company's Job Board API key.
 * A third party such as LavorAI cannot obtain these without a partnership with
 * each employer, so this path is opt-in per board through
 * `ATS_EMPLOYER_API_KEYS` (JSON: {"ashby:<org>": "<key>", "greenhouse:<board>": "<key>"}).
 * Without a key the worker keeps using the browser adapter, whose receipt is
 * the ATS's own HTTP response (see submission-proof.ts).
 *
 * The response parsers are pure so the confirmation contract is testable
 * without a network: only a 2xx success with the provider's identifiers counts.
 */
import { receiptJobId, type VerifiedSubmissionReceipt } from "./submission-receipt";

export type OfficialProvider = "ashby" | "greenhouse";
type Fetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<{ status: number; text(): Promise<string> }>;

export function boardSlug(provider: OfficialProvider, jobUrl: string): string | null {
  try {
    const url = new URL(jobUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (provider === "ashby") return /(^|\.)ashbyhq\.com$/i.test(url.hostname) ? parts[0] ?? null : null;
    if (!/(^|\.)greenhouse\.io$/i.test(url.hostname)) return null;
    return url.searchParams.get("for") ?? (parts[0] === "embed" ? null : parts[0] ?? null);
  } catch { return null; }
}

/** Per-board employer key, or null (the normal case for a job-seeker product). */
export function employerApiKey(provider: OfficialProvider, jobUrl: string, env: Record<string, string | undefined> = process.env): string | null {
  const board = boardSlug(provider, jobUrl);
  if (!board || !env.ATS_EMPLOYER_API_KEYS) return null;
  try {
    const keys = JSON.parse(env.ATS_EMPLOYER_API_KEYS) as Record<string, unknown>;
    const key = keys[`${provider}:${board.toLowerCase()}`];
    return typeof key === "string" && key.trim() ? key.trim() : null;
  } catch { return null; }
}

export type OfficialApiResult =
  | { ok: true; receipt: VerifiedSubmissionReceipt }
  | { ok: false; rejected: boolean; error: string };

const id = (value: unknown): string | undefined =>
  (typeof value === "string" || typeof value === "number") && /^[\w-]{1,160}$/.test(String(value)) ? String(value) : undefined;
const parse = (text: string): Record<string, unknown> | null => {
  try { const v = JSON.parse(text); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
};

export function verifyOfficialApiResponse(provider: OfficialProvider, jobUrl: string, endpoint: string, status: number, bodyText: string, now = new Date()): OfficialApiResult {
  const jobId = receiptJobId(provider, jobUrl);
  if (!jobId) return { ok: false, rejected: false, error: "job id non ricavabile dall'URL" };
  if (status >= 400) return { ok: false, rejected: true, error: `HTTP ${status}` };
  if (status < 200 || status >= 300) return { ok: false, rejected: false, error: `HTTP ${status}` };
  const body = parse(bodyText);
  if (!body) return { ok: false, rejected: false, error: "risposta non JSON" };
  const base = { version: 1 as const, provider, kind: "http" as const, capturedAt: now.toISOString(), jobId, endpoint, httpStatus: status };
  if (provider === "ashby") {
    const errors = body.errors;
    if (body.success !== true || (Array.isArray(errors) && errors.length)) return { ok: false, rejected: true, error: "Ashby: success=false" };
    const results = body.results as Record<string, unknown> | undefined;
    if ((results?.formMessages as Record<string, unknown> | undefined)?.blocked === true) return { ok: false, rejected: true, error: "Ashby: candidatura bloccata dal form" };
    const receiptId = id((results?.submittedFormInstance as Record<string, unknown> | undefined)?.id) ?? id(results?.applicationId);
    if (!receiptId) return { ok: false, rejected: false, error: "Ashby: nessun id nella risposta" };
    return { ok: true, receipt: { ...base, operation: "applicationForm.submit", signal: "application_id", receiptId } };
  }
  // Greenhouse Job Board API: 200 {"success":"Candidate saved successfully"}
  // (some boards also return an application/candidate id).
  if (body.error || body.errors) return { ok: false, rejected: true, error: "Greenhouse: errore di validazione" };
  const receiptId = id(body.application_id ?? body.id ?? (body.application as Record<string, unknown> | undefined)?.id);
  if (receiptId) return { ok: true, receipt: { ...base, operation: "job_board_api.application.create", signal: "application_id", receiptId } };
  if (typeof body.success === "string" && /saved|success/i.test(body.success)) return { ok: true, receipt: { ...base, operation: "job_board_api.application.create", signal: "application_accepted" } };
  return { ok: false, rejected: false, error: "Greenhouse: nessuna conferma nella risposta" };
}

/** Single POST, never retried (a timeout is ambiguous: no duplicate submits). */
export async function submitViaOfficialApi(input: {
  provider: OfficialProvider; jobUrl: string; apiKey: string; payload: Record<string, unknown>; fetchImpl?: Fetch;
}): Promise<OfficialApiResult> {
  const jobId = receiptJobId(input.provider, input.jobUrl);
  const board = boardSlug(input.provider, input.jobUrl);
  if (!jobId || !board) return { ok: false, rejected: false, error: "URL annuncio non supportato" };
  const endpoint = input.provider === "ashby"
    ? "https://api.ashbyhq.com/applicationForm.submit"
    : `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`;
  const body = input.provider === "ashby" ? { jobPostingId: jobId, ...input.payload } : input.payload;
  const doFetch: Fetch = input.fetchImpl ?? ((url, init) => fetch(url, init));
  let response: { status: number; text(): Promise<string> };
  try {
    response = await doFetch(endpoint, { method: "POST", body: JSON.stringify(body), headers: {
      "Content-Type": "application/json", Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${input.apiKey}:`).toString("base64")}`,
    } });
  } catch (err) {
    return { ok: false, rejected: false, error: `rete: ${err instanceof Error ? err.message : String(err)}` };
  }
  return verifyOfficialApiResponse(input.provider, input.jobUrl, endpoint, response.status, await response.text().catch(() => ""));
}
