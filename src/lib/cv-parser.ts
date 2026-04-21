import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

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
  // pdf-parse v2 (mehmet-kozan) vuole un Uint8Array o Buffer.
  // Istanziamo, estraiamo testo, e dismettiamo il worker pdfjs.
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result.text?.trim() ?? "";
    if (!text) {
      throw new CVParseError(
        "Il PDF non contiene testo estraibile (probabilmente è scansionato). " +
          USER_FRIENDLY_ERROR,
      );
    }
    return text;
  } finally {
    await parser.destroy().catch(() => {
      /* noop: destroy può fallire se già chiuso */
    });
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  const text = value?.trim() ?? "";
  if (!text) {
    throw new CVParseError("Il DOCX non contiene testo estraibile.");
  }
  return text;
}
