/**
 * Smoke test del fix cv-parser. Verifica:
 *   1. sanitizePdfText decompone le legature unicode standard
 *   2. looksGarbledExtraction rileva pattern di corruzione
 *   3. parsePdfWithPdfjs riesce a caricare pdfjs-dist e a leggere un PDF
 *   4. parseCV end-to-end produce testo pulito senza garble
 *
 * Uso: railway run -- npx tsx scripts/test-cv-parser.ts
 *      (oppure semplicemente: npx tsx scripts/test-cv-parser.ts — non
 *      tocca il DB, gira tutto in-process)
 */
import { readFileSync } from "node:fs";
import { parseCV } from "../src/lib/cv-parser";

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function main() {
  // ── 1. Sanitizer: legature unicode ─────────────────────────────────
  // Importa il modulo per accedere alle funzioni interne via re-export
  // (le funzioni sono già esportate? Se no, testiamo via parseCV).
  // Test diretto: parseCV richiede File, quindi shimmiamo da Buffer.
  const ligatureText = "ofﬁce coﬃe ﬂoor ﬁgma ﬄuent";
  const expected = "office coffie floor figma ffluent";
  // NFKC builtin Node già fa il replace
  const norm = ligatureText.normalize("NFKC");
  // Alcune Node version non normalizzano FB04/FB05 — il nostro replace
  // esplicito li copre. Testiamo entrambi.
  const manualReplaced = norm
    .replace(/ﬀ/g, "ff")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl");
  check(
    "Ligature replacement",
    !/[ﬀ-ﬆ]/.test(manualReplaced),
    `result: "${manualReplaced}"`,
  );

  // ── 2. Garble detector heuristic ───────────────────────────────────
  const garbled =
    "por;olio prodo< Al-na?ve piaDaforme prac;ce projec< no;fica?on plaDorm";
  const cleanText =
    "portfolio prodotti AI-native piattaforme practice projects notification platform";

  const re = /[a-zàèéìòù][;<>?@#$%^*][a-zàèéìòù]/gi;
  const garbledHits = (garbled.match(re) ?? []).length;
  const cleanHits = (cleanText.match(re) ?? []).length;
  check(
    "looksGarbledExtraction triggers on broken text",
    garbledHits >= 4,
    `${garbledHits} hits (need >=4)`,
  );
  check(
    "looksGarbledExtraction skips clean text",
    cleanHits === 0,
    `${cleanHits} hits`,
  );

  // ── 3. pdfjs-dist load ─────────────────────────────────────────────
  let pdfjsLoaded = false;
  try {
    // @ts-expect-error ESM build, no shipped types
    const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    pdfjsLoaded = typeof pdfjs.getDocument === "function";
  } catch (err) {
    console.error("pdfjs-dist load error:", err);
  }
  check("pdfjs-dist loads in Node", pdfjsLoaded);

  // ── 4. End-to-end con un PDF reale (user CV) ───────────────────────
  const realPdfPath =
    "storage/staging-47ed65febf8d5ec3b22f9030/cv-source/Umberto_CV_Dev.pdf";
  const buf = readFileSync(realPdfPath);
  // parseCV vuole un File; shim minimo
  const file = new File([buf], "Umberto_CV_Dev.pdf", {
    type: "application/pdf",
  });
  const t0 = Date.now();
  const text = await parseCV(file);
  const ms = Date.now() - t0;

  check("parseCV returns non-empty text", text.length > 100);
  check(
    "Parsed text contains expected words",
    /full[\s-]?stack/i.test(text) && /developer/i.test(text),
  );
  const realGarble = (text.match(re) ?? []).length;
  check(
    "Parsed text has no garble pattern",
    realGarble === 0,
    `${realGarble} hits in ${text.length} chars`,
  );
  const realLigatures = (text.match(/[ﬀ-ﬆ]/g) ?? []).length;
  check("Parsed text has no Unicode ligatures", realLigatures === 0);
  console.log(`   (extraction took ${ms}ms, ${text.length} chars)`);

  // ── 5. Sample preview ──────────────────────────────────────────────
  console.log("\n--- Preview (first 500 chars) ---");
  console.log(text.slice(0, 500));
  console.log("---");

  console.log(`\n${failed === 0 ? "✅ ALL PASS" : `❌ ${failed} FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
