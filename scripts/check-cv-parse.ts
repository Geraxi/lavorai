/**
 * Quick check: verifica che il PDF in fixtures/fake-cv.pdf sia
 * text-based e parse-able. Non chiama Claude, serve solo a validare
 * il parsing prima di spendere API calls.
 *
 * Uso: npx tsx scripts/check-cv-parse.ts
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCV } from "../src/lib/cv-parser";

async function main() {
  const arg = process.argv[2] ?? "fixtures/fake-cv.pdf";
  const path = resolve(arg);
  const bytes = await readFile(path);
  const name = path.split("/").pop() ?? "cv.pdf";
  const type = name.toLowerCase().endsWith(".docx")
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";
  const file = new File([bytes], name, { type });

  console.log(`📄  File: ${path} (${bytes.length} bytes)`);
  const start = Date.now();
  const text = await parseCV(file);
  const ms = Date.now() - start;

  console.log(`✅  Parsing riuscito in ${ms}ms — ${text.length} caratteri.\n`);
  console.log("--- Prime 800 chars ---");
  console.log(text.slice(0, 800));
  console.log("\n--- Ultime 400 chars ---");
  console.log(text.slice(-400));
}

main().catch((err) => {
  console.error("❌  Parsing fallito:", err);
  process.exit(1);
});
