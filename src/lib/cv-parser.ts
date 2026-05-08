import mammoth from "mammoth";
// pdf-parse v1 (API diversa da v2) — v2 richiede DOMMatrix che non esiste
// in Node serverless (Vercel). v1 usa solo Node primitives.
import pdfParse from "pdf-parse";

/**
 * Errore dedicato ai fallimenti di parsing CV. Permette al route
 * handler di distinguerlo da errori generici e restituire 422.
 */
export class CVParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "CVParseError";
  }
}

const MIME_PDF = "application/pdf";
const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const USER_FRIENDLY_ERROR =
  "Impossibile leggere il CV. Assicurati che il PDF non sia scansionato e che il DOCX non sia corrotto.";

/**
 * Estrae il testo da un CV caricato dall'utente.
 * Supporta solo PDF text-based (non scansionato) e DOCX.
 */
export async function parseCV(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (file.type === MIME_PDF || file.name.toLowerCase().endsWith(".pdf")) {
      return await parsePdf(buffer);
    }
    if (file.type === MIME_DOCX || file.name.toLowerCase().endsWith(".docx")) {
      return await parseDocx(buffer);
    }
    throw new CVParseError(
      "Formato non supportato. Carica un PDF o un DOCX.",
    );
  } catch (err) {
    if (err instanceof CVParseError) throw err;
    console.error("[parseCV] parsing fallito", err);
    throw new CVParseError(USER_FRIENDLY_ERROR, err);
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  // Step 1: prima estrazione con pdf-parse (veloce, copre 95% dei casi).
  let text = "";
  try {
    const result = await pdfParse(buffer);
    text = sanitizePdfText(result.text ?? "").trim();
  } catch (err) {
    console.warn("[parseCV] pdf-parse fallito, provo pdfjs-dist", err);
  }

  // Step 2: se pdf-parse ha estratto poco testo o lo ha estratto rotto
  // (font subset senza ToUnicode CMap → caratteri tipo `por;olio`,
  // `prodo<`, `Al-na?ve`), fallback su pdfjs-dist che è CID-aware.
  if (!text || looksGarbledExtraction(text)) {
    try {
      const recovered = await parsePdfWithPdfjs(buffer);
      const cleaned = sanitizePdfText(recovered).trim();
      // Tieni il fallback solo se è migliorato
      if (
        cleaned.length > text.length ||
        (text && !looksGarbledExtraction(cleaned))
      ) {
        text = cleaned;
      }
    } catch (err) {
      console.warn("[parseCV] fallback pdfjs-dist fallito", err);
    }
  }

  if (!text) {
    throw new CVParseError(
      "Il PDF non contiene testo estraibile (probabilmente è scansionato). " +
        USER_FRIENDLY_ERROR,
    );
  }
  return text;
}

/**
 * Estrazione con pdfjs-dist diretto, CID-aware. Usa il bundle ESM con
 * `disableFontFace: true` (Node) e include i CMap standard di pdfjs.
 * Costoso (~3-5x pdf-parse) → usato solo come fallback quando la prima
 * estrazione è rotta o vuota.
 */
async function parsePdfWithPdfjs(buffer: Buffer): Promise<string> {
  // @ts-expect-error pdfjs-dist ESM build has no shipped type for this entry
  const pdfjs = (await import("pdfjs-dist/build/pdf.mjs")) as unknown as {
    getDocument: (params: {
      data: Uint8Array;
      useSystemFonts: boolean;
      disableFontFace: boolean;
      isEvalSupported: boolean;
    }) => { promise: Promise<PdfjsDocument> };
  };
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it: PdfjsTextItem) => ("str" in it ? it.str : ""))
      .join(" ");
    pages.push(pageText);
  }
  return pages.join("\n\n");
}

interface PdfjsTextItem {
  str?: string;
}
interface PdfjsDocument {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: PdfjsTextItem[] }>;
  }>;
}

/**
 * Sanitizza il testo estratto da pdf-parse:
 *   1. NFKC normalization → decompone le legature standard (ﬁ → fi, ﬀ → ff, …).
 *   2. Replace esplicito delle legature Unicode FB00-FB06 (alcune NFKC non
 *      tocca a seconda della versione Node).
 *   3. Strip control chars (\x00-\x08, \x0B-\x0C, \x0E-\x1F, \x7F) che
 *      pdf-parse a volte emette per glifi non mappati.
 *   4. Collassa whitespace verticale duplicato.
 *
 * Non risolve i casi con font subset privi di ToUnicode CMap (vedi
 * `looksGarbledExtraction` + TODO migrazione a pdfjs-dist diretto).
 */
function sanitizePdfText(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFKC");
  s = s
    .replace(/ﬀ/g, "ff")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl")
    .replace(/ﬅ/g, "ft")
    .replace(/ﬆ/g, "st");
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

/**
 * Heuristic: se il PDF aveva font subset senza ToUnicode CMap, pdf-parse
 * emette punctuation o control char dentro le parole (es. `por;olio`,
 * `prodo<`, `Al-na?ve`). Conta le occorrenze di `[a-z][;<>?@#$%^*]+[a-z]`
 * → se >5 il PDF è probabilmente corrotto e dobbiamo ri-estrarlo con un
 * estrattore CID-aware (pdfjs-dist diretto).
 */
function looksGarbledExtraction(text: string): boolean {
  const garbledPattern = /[a-zàèéìòù][;<>?@#$%^*][a-zàèéìòù]/gi;
  const matches = text.match(garbledPattern);
  return (matches?.length ?? 0) > 5;
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  const text = value?.trim() ?? "";
  if (!text) {
    throw new CVParseError("Il DOCX non contiene testo estraibile.");
  }
  return text;
}
