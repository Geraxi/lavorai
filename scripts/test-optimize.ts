/**
 * Script di test manuale della pipeline AI di LavorAI.
 *
 * Legge un CV PDF da fixtures/fake-cv.pdf e un annuncio testo da
 * fixtures/fake-job.txt, chiama le funzioni lib direttamente (bypassa
 * l'API route), stampa in console il JSON strutturato di Claude e
 * salva i DOCX in /tmp.
 *
 * IMPORTANTE: questo script NON viene eseguito automaticamente dallo
 * Sprint 2. Devi creare le fixtures manualmente — vedi README sezione
 * "Testing Sprint 2".
 *
 * Uso:
 *   npx tsx scripts/test-optimize.ts                       # usa fixtures/fake-cv.pdf
 *   npx tsx scripts/test-optimize.ts fixtures/fake-cv-dev.pdf
 *   CV_FIXTURE=fixtures/fake-cv-dev.pdf npx tsx scripts/test-optimize.ts
 *
 * Richiede ANTHROPIC_API_KEY in .env.local.
 */

import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { optimizeCV } from "../src/lib/claude";
import { parseCV } from "../src/lib/cv-parser";
import {
  generateCoverLetterDocx,
  generateOptimizedCVDocx,
} from "../src/lib/docx-generator";

// Carica .env.local se presente (parser minimal, nessuna libreria esterna).
function loadDotEnvLocal(): void {
  try {
    const content = readFileSync(resolve(".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      // .env.local ha precedenza se il valore esistente è vuoto
      // (es. ANTHROPIC_API_KEY="" ereditato dalla shell del parent).
      const current = process.env[key];
      if (key && (current === undefined || current === "")) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local non trovato — ok se le env sono già in shell
  }
}
loadDotEnvLocal();

async function main() {
  const cvArg =
    process.argv[2] ?? process.env.CV_FIXTURE ?? "fixtures/fake-cv.pdf";
  const cvPath = resolve(cvArg);
  const jobPath = resolve("fixtures/fake-job.txt");

  console.log(`📄  CV: ${cvPath}`);
  console.log(`📄  Job: ${jobPath}\n`);

  const cvBytes = await readFile(cvPath);
  const jobPosting = await readFile(jobPath, "utf8");

  // Ricrea un File a partire dal Buffer (parseCV vuole un File).
  const cvName = cvPath.split("/").pop() ?? "cv.pdf";
  const cvType = cvName.toLowerCase().endsWith(".docx")
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";
  const cvFile = new File([cvBytes], cvName, { type: cvType });

  console.log("🔍  Estraggo testo dal CV...");
  const cvText = await parseCV(cvFile);
  console.log(`    → ${cvText.length} caratteri estratti`);

  console.log("🧠  Chiamo Claude (può richiedere 30-60s)...");
  const result = await optimizeCV({ cvText, jobPosting });

  console.log("\n✅  Risultato JSON:\n");
  console.log(JSON.stringify(result, null, 2));

  console.log("\n💾  Genero DOCX...");
  const [cvBuffer, clBuffer] = await Promise.all([
    generateOptimizedCVDocx(result.optimizedCV),
    generateCoverLetterDocx(result.coverLetter),
  ]);

  const cvOut = "/tmp/lavorai-cv.docx";
  const clOut = "/tmp/lavorai-cover-letter.docx";
  await writeFile(cvOut, cvBuffer);
  await writeFile(clOut, clBuffer);

  console.log(`    → ${cvOut}`);
  console.log(`    → ${clOut}`);
  console.log("\n🎯  ATS score:", result.atsScore);
  console.log("📝  Suggerimenti:");
  for (const s of result.suggestions) console.log(`    • ${s}`);
}

main().catch((err) => {
  console.error("❌  Errore:", err);
  process.exit(1);
});
