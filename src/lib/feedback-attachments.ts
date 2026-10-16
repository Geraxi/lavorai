import sharp from "sharp";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ReportError } from "./feedback-errors";
import { isFeedbackScannerConfigured, scanFeedbackFile } from "./feedback-scanner";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from "./feedback";

export const MAX_ACCOUNT_ATTACHMENT_BYTES = 30 * 1024 * 1024;
export type PreparedAttachment = { filename: string; contentType: string; byteLength: number; data: Uint8Array<ArrayBuffer>; scanStatus: "sanitized" | "quarantined" | "clean" };
const formats = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf" } as const;
function fileKind(data: Buffer): keyof typeof formats | null {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "jpeg";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (/^%PDF-(1\.[0-7]|2\.0)[\r\n]/.test(data.toString("ascii", 0, 9))) return "pdf";
  return null;
}

// Untrusted PDF parsing runs off the request thread with a time/heap bound.
// No rendering, font evaluation, external resources, scripts or browser PDF preview.
export async function validateFeedbackPdf(data: Buffer) {
  const source = data.toString("latin1").replace(/#([0-9a-f]{2})/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
  if (!/%%EOF\s*$/.test(source) || /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|XFA|RichMedia|Encrypt)\b/.test(source)) throw new ReportError("invalid_attachment", 400);
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(`
      const {parentPort, workerData} = require('node:worker_threads');
      (async () => {
        const {getDocument} = await import(workerData.parser);
        const task = getDocument({data: new Uint8Array(workerData.data), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, stopAtErrors: true, verbosity: 0});
        task.onPassword = () => { task.destroy(); parentPort.postMessage(false); };
        const doc = await task.promise;
        if (!doc.numPages || doc.numPages > 50 || await doc.getJSActions() || await doc.getAttachments() || await doc.getFieldObjects()) throw Error('unsafe');
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (await page.getJSActions()) throw Error('unsafe');
          const annotations = await page.getAnnotations();
          if (annotations.some(a => a.actions || a.attachment || a.subtype === 'Widget' || a.subtype === 'RichMedia')) throw Error('unsafe');
        }
        await doc.destroy(); parentPort.postMessage(true);
      })().catch(() => parentPort.postMessage(false));
    `, { eval: true, workerData: { data, parser: pathToFileURL(join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 }, stdout: true, stderr: true });
    const finish = (valid: boolean) => { clearTimeout(timer); void worker.terminate(); valid ? resolve() : reject(new ReportError("invalid_attachment", 400)); };
    const timer = setTimeout(() => finish(false), 5000);
    worker.once("message", valid => finish(valid === true));
    worker.once("error", () => finish(false));
    worker.once("exit", code => { if (code !== 0) finish(false); });
  });
}

async function normalizeFeedbackAttachments(files: File[]): Promise<PreparedAttachment[]> {
  if (files.length > MAX_ATTACHMENTS) throw new ReportError("attachment_limit", 400);
  if (files.reduce((size, f) => size + f.size, 0) > MAX_ATTACHMENT_BYTES) throw new ReportError("attachment_too_large", 413);
  const result: PreparedAttachment[] = [];
  for (const file of files) {
    if (!file.size) throw new ReportError("invalid_attachment", 400);
    let data: Buffer = Buffer.from(await file.arrayBuffer());
    const kind = fileKind(data);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!kind || (file.type && file.type !== formats[kind]) || !(kind === "jpeg" ? ["jpg", "jpeg"].includes(ext ?? "") : ext === kind)) throw new ReportError("invalid_attachment", 400);
    let scanStatus: PreparedAttachment["scanStatus"];
    if (kind === "pdf") {
      // New PDFs never enter indefinite quarantine. A missing/unavailable
      // scanner rejects the entire submission before any report/file is stored.
      if (!isFeedbackScannerConfigured()) throw new ReportError("pdf_disabled", 415);
      await validateFeedbackPdf(data);
      if (await scanFeedbackFile(data) !== "clean") throw new ReportError("scanner_unavailable", 503);
      scanStatus = "clean";
    } else {
      try {
        const image = sharp(data, { limitInputPixels: 16_000_000, failOn: "warning", animated: true });
        const metadata = await image.metadata();
        if (metadata.format !== kind || (metadata.pages ?? 1) !== 1) throw new Error("invalid image");
        // Full decode + encode strips original metadata, appended payloads and filenames.
        data = await image.rotate().toFormat(kind).timeout({ seconds: 5 }).toBuffer();
      } catch { throw new ReportError("invalid_attachment", 400); }
      scanStatus = await scanFeedbackFile(data) === "clean" ? "clean" : "sanitized";
    }
    const stem = file.name.slice(0, file.name.lastIndexOf(".")).replace(/[^A-Za-z0-9_-]/g, "_").replace(/^[^A-Za-z0-9]+/, "").slice(0, 90) || "attachment";
    result.push({ filename: `${stem}.${kind === "jpeg" ? "jpg" : kind}`, contentType: formats[kind], byteLength: data.length, data: new Uint8Array(data), scanStatus });
  }
  if (result.reduce((size, f) => size + f.byteLength, 0) > MAX_ATTACHMENT_BYTES) throw new ReportError("attachment_too_large", 413);
  return result;
}

// Bound concurrent native decoders/PDF workers per server instance. Durable
// per-user attempt limits are enforced separately before multipart parsing.
let processingUploads = 0;
export async function prepareFeedbackAttachments(files: File[]): Promise<PreparedAttachment[]> {
  if (!files.length) return [];
  if (processingUploads >= 2) throw new ReportError("upload_busy", 429, 10);
  processingUploads++;
  try { return await normalizeFeedbackAttachments(files); }
  finally { processingUploads--; }
}
