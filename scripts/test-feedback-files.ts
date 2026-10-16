import assert from "node:assert/strict";
import { createServer } from "node:net";
import sharp from "sharp";
import { prepareFeedbackAttachments, validateFeedbackPdf } from "../src/lib/feedback-attachments";
import { scanFeedbackFile } from "../src/lib/feedback-scanner";
import { MAX_ATTACHMENT_BYTES } from "../src/lib/feedback";
import { syntheticPdf } from "./feedback-file-fixtures";

async function main() {
  delete process.env.FEEDBACK_CLAMD_SOCKET; delete process.env.FEEDBACK_CLAMD_HOST;
  const file = (data: Buffer, name: string, type: string) => new File([new Uint8Array(data)], name, { type });
  const fails = (promise: Promise<unknown>, code = "invalid_attachment") => assert.rejects(promise, (e: any) => e.code === code);
  for (const kind of ["png", "jpeg", "webp"] as const) {
    const original = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#12995b" } }).toFormat(kind).toBuffer();
    const [stored] = await prepareFeedbackAttachments([file(Buffer.concat([original, Buffer.from("<script>alert('tail')</script>")]), `../../evil\r\nname.${kind}`, `image/${kind}`)]);
    assert.equal(stored.scanStatus, "sanitized"); assert.match(stored.filename, /^[A-Za-z0-9][A-Za-z0-9_-]*\.(png|jpg|webp)$/);
    assert.equal(Buffer.from(stored.data).includes(Buffer.from("<script>")), false);
    const meta = await sharp(stored.data).metadata(); assert.equal(meta.format, kind); assert.equal(meta.width, 40); assert.equal(meta.exif, undefined);
    await fails(prepareFeedbackAttachments([file(original, "spoof.pdf", "application/pdf")]));
    await fails(prepareFeedbackAttachments([file(original.subarray(0, 12), `truncated.${kind}`, `image/${kind}`)]));
  }
  for (const [name, type, data] of [
    ["script.svg", "image/svg+xml", "<svg onload='alert(1)'/>"], ["html.png", "image/png", "<html>secret</html>"],
    ["program.jpg", "image/jpeg", "MZexecutable"], ["document.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "PKzip"],
    ["empty.png", "image/png", ""],
  ]) await fails(prepareFeedbackAttachments([file(Buffer.from(data), name, type)]));
  await fails(prepareFeedbackAttachments([file(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1), "large.png", "image/png")]), "attachment_too_large");
  await fails(prepareFeedbackAttachments(Array.from({ length: 4 }, () => file(Buffer.from("x"), "a.png", "image/png"))), "attachment_limit");
  const huge = await sharp({ create: { width: 4100, height: 4100, channels: 3, background: "white" } }).png().toBuffer();
  await fails(prepareFeedbackAttachments([file(huge, "pixels.png", "image/png")]));
  const pdf = syntheticPdf();
  await validateFeedbackPdf(pdf);
  await fails(prepareFeedbackAttachments([file(pdf, "disabled.pdf", "application/pdf")]), "pdf_disabled");
  await fails(validateFeedbackPdf(Buffer.from("%PDF-1.4\nfake\n%%EOF\n")));
  const parallelPng = await sharp({ create: { width: 40, height: 30, channels: 3, background: "white" } }).png().toBuffer();
  const concurrent = await Promise.allSettled(Array.from({ length: 3 }, () => prepareFeedbackAttachments([file(parallelPng, "parallel.png", "image/png")])));
  assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 2);
  assert.equal(concurrent.filter(r => r.status === "rejected" && r.reason.code === "upload_busy").length, 1);
  for (const extra of ["/OpenAction << /S /JavaScript /JS (app.alert('x')) >>", "/AA << >>", "/Encrypt 7 0 R", "/Java#53cript 7 0 R"]) await fails(validateFeedbackPdf(syntheticPdf(extra)));
  await fails(validateFeedbackPdf(Buffer.concat([pdf, Buffer.from("MZtrailing")]))) ;
  console.log("PASS PNG/JPEG/WebP decode/re-encode, metadata/tail removal, malicious filenames, spoofed MIME/extensions, truncated files, SVG/HTML/EXE/DOCX rejection, pixel/byte/count bounds, PDF structure/active content and disabled unconfigured PDF uploads.");

  let verdict = "stream: OK\0"; let observed = Buffer.alloc(0);
  const scanner = createServer(socket => {
    let pending = Buffer.alloc(0), command = false, chunks: Buffer[] = [];
    socket.on("data", data => {
      pending = Buffer.concat([pending, data]);
      if (!command) { const end = pending.indexOf(0); if (end < 0) return; assert.equal(pending.subarray(0, end).toString(), "zINSTREAM"); pending = pending.subarray(end + 1); command = true; }
      while (pending.length >= 4) { const length = pending.readUInt32BE(0); if (pending.length < 4 + length) return; const part = pending.subarray(4, 4 + length); pending = pending.subarray(4 + length); if (!length) { observed = Buffer.concat(chunks); socket.end(verdict); return; } chunks.push(part); }
    });
  });
  await new Promise<void>(resolve => scanner.listen(0, "127.0.0.1", resolve));
  process.env.FEEDBACK_CLAMD_HOST = "127.0.0.1"; process.env.FEEDBACK_CLAMD_PORT = String((scanner.address() as { port: number }).port);
  try {
    assert.equal(await scanFeedbackFile(pdf), "clean"); assert.deepEqual(observed, pdf);
    assert.equal((await prepareFeedbackAttachments([file(pdf, "ok.pdf", "application/pdf")]))[0].scanStatus, "clean");
    verdict = "stream: Synthetic-Test FOUND\0"; await fails(scanFeedbackFile(pdf), "attachment_rejected");
    verdict = "stream: size limit exceeded ERROR\0"; await fails(scanFeedbackFile(pdf), "scanner_unavailable");
    await fails(prepareFeedbackAttachments([file(pdf, "outage.pdf", "application/pdf")]), "scanner_unavailable");
    verdict = "stream: OK"; await fails(scanFeedbackFile(pdf), "scanner_unavailable");
  } finally { await new Promise<void>(resolve => scanner.close(() => resolve())); delete process.env.FEEDBACK_CLAMD_HOST; delete process.env.FEEDBACK_CLAMD_PORT; }
  console.log("PASS local synthetic ClamAV protocol clean/infected/error/incomplete replies; no real malware scanner or external document transfer used.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
