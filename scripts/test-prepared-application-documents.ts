import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadReusableApplicationDocuments } from "../src/lib/prepared-application-documents";

async function main() {
  const app = {
    cvDocxPath: "fixture/cv.docx",
    coverLetterPath: "fixture/letter.docx",
    coverLetterText: "Dear hiring team,\nMy real saved cover letter.\n",
    atsScore: 83,
    suggestionsJson: '["Keep the original advice"]',
    cvLanguage: "en",
  };
  const files = new Map([
    [app.cvDocxPath, Buffer.from("fixture CV bytes")],
    [app.coverLetterPath, Buffer.from("fixture letter bytes")],
  ]);
  const calls: string[] = [];
  const options = {
    allowReuse: true,
    jobLanguage: "en",
    readFile: async (path: string) => {
      calls.push(path);
      const bytes = files.get(path);
      if (!bytes) throw new Error("Fixture file missing");
      return bytes;
    },
  };
  const reused = await loadReusableApplicationDocuments(app, options);
  assert.ok(reused);
  assert.equal(reused.cvPath, app.cvDocxPath);
  assert.equal(reused.clPath, app.coverLetterPath);
  assert.equal(reused.cvBuffer, files.get(app.cvDocxPath));
  assert.equal(reused.clBuffer, files.get(app.coverLetterPath));
  assert.deepEqual(reused.metadata, {
    coverLetterText: app.coverLetterText,
    atsScore: app.atsScore,
    suggestionsJson: app.suggestionsJson,
  }, "reuse keeps the original letter and metadata, not placeholder optimization output");
  assert.deepEqual(calls.sort(), [app.coverLetterPath, app.cvDocxPath].sort());

  const nullable = await loadReusableApplicationDocuments({ ...app, atsScore: null, suggestionsJson: null }, options);
  assert.deepEqual(nullable?.metadata, { coverLetterText: app.coverLetterText, atsScore: null, suggestionsJson: null });
  const zero = await loadReusableApplicationDocuments({ ...app, atsScore: 0, suggestionsJson: "[]" }, options);
  assert.equal(zero?.metadata.atsScore, 0, "a real zero is preserved too");

  for (const change of [
    { coverLetterText: null }, { coverLetterText: " \n" },
    { coverLetterText: "(reused)" }, { coverLetterText: "  (REUSED)\n" },
    { cvDocxPath: null }, { cvDocxPath: " " }, { coverLetterPath: null },
    { cvLanguage: null }, { cvLanguage: "it" },
  ]) {
    calls.length = 0;
    assert.equal(await loadReusableApplicationDocuments({ ...app, ...change }, options), null,
      `unsafe/incomplete prepared state must regenerate: ${JSON.stringify(change)}`);
    assert.equal(calls.length, 0, "invalid metadata does not read files");
  }
  calls.length = 0;
  assert.equal(await loadReusableApplicationDocuments(app, { ...options, allowReuse: false }), null);
  assert.equal(calls.length, 0, "synthetic ATS flow must not reuse actual candidate files");
  assert.equal(await loadReusableApplicationDocuments(app, { ...options, readFile: async () => Buffer.alloc(0) }), null);
  assert.equal(await loadReusableApplicationDocuments(app, { ...options, readFile: async () => { throw new Error("storage unavailable"); } }), null);
  assert.equal(await loadReusableApplicationDocuments({ ...app, coverLetterPath: "fixture/missing.docx" }, options), null);

  // Integration contract: all delivery paths and the durable write use the same
  // metadata returned above; reuse must not synthesize an empty optimized CV.
  const worker = readFileSync(new URL("../src/lib/application-worker.ts", import.meta.url), "utf8");
  assert.match(worker, /documentMetadata = prepared\.metadata/);
  assert.equal((worker.match(/coverLetterText: documentMetadata\.coverLetterText/g) ?? []).length, 3);
  assert.match(worker, /atsScore: documentMetadata\.atsScore/);
  assert.match(worker, /suggestionsJson: documentMetadata\.suggestionsJson/);
  assert.doesNotMatch(worker, /coverLetter: "\(reused\)"/);
  assert.match(worker, /if \(reused && !atsTestSkipsDocumentTailoring/,
    "freshly regenerated files must not be paired with a stale PDF");
  console.log("PASS prepared document reuse: real text/metadata preserved; incomplete, corrupted or mismatched bundles regenerate; no external calls");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
