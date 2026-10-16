import type { NextRequest } from "next/server";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, reportSchema } from "./feedback";
import { readReportBody } from "./feedback-server";
import { ReportError } from "./feedback-errors";
import { prepareFeedbackAttachments } from "./feedback-attachments";

/** Single atomic report submission. Nothing is persisted until all files pass. */
export async function readReportSubmission(request: NextRequest) {
  let input: unknown;
  let files: File[] = [];
  if (request.headers.get("content-type")?.split(";")[0].trim() === "multipart/form-data") {
    const maxBytes = MAX_ATTACHMENT_BYTES + 32_000;
    if (Number(request.headers.get("content-length")) > maxBytes) throw new ReportError("attachment_too_large", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new ReportError("invalid_report", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new ReportError("attachment_too_large", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    try {
      const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
      if ([...form.keys()].some(k => k !== "report" && k !== "files") || form.getAll("report").length !== 1) throw new Error("invalid fields");
      const text = form.get("report");
      if (typeof text !== "string" || Buffer.byteLength(text) > 24_000) throw new Error("invalid report");
      input = JSON.parse(text);
      const entries = form.getAll("files");
      if (entries.length > MAX_ATTACHMENTS) throw new ReportError("attachment_limit", 400);
      if (entries.some(f => typeof f === "string")) throw new Error("invalid files");
      files = entries as File[];
    } catch (error) { if (error instanceof ReportError) throw error; throw new ReportError("invalid_report", 400); }
  } else input = await readReportBody(request);
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) throw new ReportError("invalid_report", 400);
  return { input: parsed.data, attachments: await prepareFeedbackAttachments(files) };
}
