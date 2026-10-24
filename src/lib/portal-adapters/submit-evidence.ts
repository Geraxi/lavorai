import type { Page } from "playwright";
import type { CanaryLog, SubmitNetworkEvidence } from "./types";
import { canaryScreenshotFilename } from "./form-labels";

export interface EvidenceResponse {
  url: string;
  postData?: string | null;
  status: number;
  body: string | null;
}

const BODY_CAP = 2048;

function operationName(postData: string | null | undefined): string | undefined {
  if (!postData || postData.length > 256_000) return undefined;
  try {
    const parsed = JSON.parse(postData) as { operationName?: unknown };
    return typeof parsed.operationName === "string" ? parsed.operationName : undefined;
  } catch {
    return undefined;
  }
}

/** Screenshot → Vercel Blob when configured; never throws. */
export async function uploadSubmitScreenshot(
  page: Page,
  label: string,
  applicationId?: string,
): Promise<string | null> {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
    const { put } = await import("@vercel/blob");
    const buf = await page.screenshot({ type: "png", fullPage: false });
    const filename = canaryScreenshotFilename(label);
    const blob = await put(filename, buf, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: true,
    });
    return blob.url;
  } catch (err) {
    console.warn("[submit-evidence] screenshot upload failed", err);
    return null;
  }
}

export function networkEvidence(responses: EvidenceResponse[]): SubmitNetworkEvidence[] {
  return responses.map((r) => ({
    url: r.url,
    operation: operationName(r.postData),
    httpStatus: r.status,
    body: r.body ? r.body.slice(0, BODY_CAP) : null,
  }));
}

/** Build canaryLog evidence after a portal submit click. */
export async function captureSubmitEvidence(
  page: Page,
  responses: EvidenceResponse[],
  opts: { applicationId?: string; urlBeforeSubmit?: string; fields?: CanaryLog["fields"]; resumeAttachedFilename?: string | null; preSubmitScreenshotUrl?: string | null } = {},
): Promise<CanaryLog> {
  const last = responses.at(-1) ?? null;
  const bodyTextAfterSubmit = await page.locator("body").innerText().catch(() => "");
  const postSubmitScreenshotUrl = await uploadSubmitScreenshot(page, "post-submit", opts.applicationId);
  return {
    resumeAttachedFilename: opts.resumeAttachedFilename ?? null,
    preSubmitScreenshotUrl: opts.preSubmitScreenshotUrl ?? null,
    postSubmitScreenshotUrl,
    fields: opts.fields ?? [],
    submitHttpStatus: last?.status ?? null,
    submitHttpBody: last?.body ? last.body.slice(0, BODY_CAP).replace(/\s+/g, " ") : null,
    urlBeforeSubmit: opts.urlBeforeSubmit ?? "",
    urlAfterSubmit: page.url(),
    bodyTextAfterSubmit: bodyTextAfterSubmit.slice(0, BODY_CAP).replace(/\s+/g, " "),
    submitResponses: networkEvidence(responses),
    capturedAt: new Date().toISOString(),
  };
}
