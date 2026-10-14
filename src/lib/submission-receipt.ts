/** Safe to import in API/display code: no browser, database or provider SDK. */
const PROVIDERS = new Set(["ashby", "greenhouse", "lever", "workable", "recruitee", "personio", "teamtailor", "bamboohr", "breezy", "pinpoint", "smartrecruiters"]);
const identifier = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,160}$/.test(value);
export interface VerifiedSubmissionReceipt {
  version: 1; provider: string; kind: "http" | "dom"; capturedAt: string; jobId: string;
  endpoint?: string; operation?: string; httpStatus?: number; receiptId?: string; signal: string;
}
export function parseVerifiedSubmissionReceipt(json: string | null | undefined, submittedVia?: string | null): VerifiedSubmissionReceipt | null {
  if (!json || json.length > 8000) return null;
  try {
    const receipt = JSON.parse(json);
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)
      || receipt.version !== 1 || !PROVIDERS.has(receipt.provider) || !identifier(receipt.jobId)
      || typeof receipt.capturedAt !== "string" || !Number.isFinite(Date.parse(receipt.capturedAt))
      || (submittedVia != null && submittedVia !== `portal_${receipt.provider}`)) return null;
    if (receipt.receiptId != null && !identifier(receipt.receiptId)) return null;
    if (receipt.kind === "dom") return receipt.signal === "new_receipt_and_form_removed" ? receipt : null;
    if (receipt.kind !== "http" || !Number.isInteger(receipt.httpStatus) || receipt.httpStatus < 200 || receipt.httpStatus >= 300
      || !["application_id", "application_accepted", "application_receipt_message"].includes(receipt.signal)
      || (receipt.signal === "application_id" && !receipt.receiptId)) return null;
    if (receipt.provider === "ashby") {
      if (typeof receipt.operation !== "string" || !["applytojobposting", "jobboardapplicationformsubmit", "apijobboardapplicationformsubmit"].includes(receipt.operation.toLowerCase())) return null;
    } else if (receipt.operation !== "application.create") return null;
    const endpoint = new URL(receipt.endpoint);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null;
    const domains: Record<string, string[]> = { ashby: ["ashbyhq.com"], greenhouse: ["greenhouse.io"], lever: ["lever.co"],
      workable: ["workable.com"], personio: ["personio.de", "personio.com"], bamboohr: ["bamboohr.com"],
      breezy: ["breezy.hr"], pinpoint: ["pinpointhq.com"], smartrecruiters: ["smartrecruiters.com"] };
    if (domains[receipt.provider] && !domains[receipt.provider].some((host) => endpoint.hostname === host || endpoint.hostname.endsWith(`.${host}`))) return null;
    return receipt;
  } catch { return null; }
}
export function hasVerifiedSubmissionReceipt(json: string | null | undefined, submittedVia?: string | null): boolean {
  return parseVerifiedSubmissionReceipt(json, submittedVia) !== null;
}

export function receiptJobId(provider: string, jobUrl: string): string | null {
  try {
    const url = new URL(jobUrl);
    const patterns: Record<string, RegExp> = {
      ashby: /^\/[^/]+\/([^/]+)/, greenhouse: /\/jobs\/(\d+)/, lever: /^\/[^/]+\/([^/]+)/,
      workable: /\/j\/([^/]+)/, recruitee: /\/o\/([^/]+)/, personio: /\/job\/(\d+)/,
      teamtailor: /\/jobs\/(\d+)/, bamboohr: /\/careers\/(\d+)/, breezy: /\/p\/([^/]+)/,
      pinpoint: /\/postings\/([^/]+)/, smartrecruiters: /^\/[^/]+\/(\d+)/,
    };
    const id = (provider === "greenhouse" ? url.searchParams.get("gh_jid") : null) || url.pathname.match(patterns[provider] ?? /$^/)?.[1];
    if (!identifier(id) || /^(?:thank[-_]?you|thanks|confirmation|success|submitted|application-submitted)$/i.test(id)) return null;
    return id;
  } catch { return null; }
}
