import Anthropic from "@anthropic-ai/sdk";
import type { OptimizationResult } from "@/types/cv";
import {
  SYSTEM_PROMPT,
  USER_PROMPT_TEMPLATE,
} from "@/lib/prompts/cv-optimization";

/**
 * Modello Claude usato per l'ottimizzazione CV.
 * Stringa esatta richiesta dallo Sprint 2 — non modificare senza
 * confermare con il team.
 */
const CV_OPTIMIZATION_MODEL = "claude-sonnet-4-20250514";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY mancante. Aggiungila a .env.local per usare /api/optimize.",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export interface OptimizeCVInput {
  cvText: string;
  jobPosting: string;
  /** Frasi/concetti extra da intrecciare nella cover letter (non nel CV).
   *  Esempio: un founder che vuole menzionare che sta candidandosi dalla
   *  sua stessa piattaforma. Claude le integra in modo naturale, non copia
   *  letterale. Ogni elemento è una istruzione/idea in linguaggio naturale.
   */
  coverLetterHints?: string[];
  /** Contesto/esperienza extra fornito dall'utente alla creazione del
   *  round (ApplicationSession.customContext). Iniettato in Claude per
   *  arricchire il CV con informazioni che il CV originale non contiene
   *  (es. side project, esperienze freelance non menzionate, ecc).
   *  Mai inventare: usa solo se l'utente l'ha scritto esplicitamente. */
  sessionContext?: string | null;
  /** Contesto P.IVA: se presente, Claude scrive un PITCH B2B invece di
   *  una classica cover letter da dipendente. Include tariffa,
   *  disponibilità, partita IVA, portfolio. */
  pivaContext?: {
    dailyRate?: number | null;
    availableFrom?: string | null;
    vatNumber?: string | null;
    portfolioUrl?: string | null;
    candidateName?: string | null;
  };
}

/**
 * Ottimizza il CV per un annuncio specifico via Claude.
 *
 * Il SYSTEM_PROMPT è lungo e stabile → viene marcato con
 * `cache_control: ephemeral` per abilitare il prompt caching lato
 * Anthropic (risparmio latenza + costi a partire dalla seconda
 * chiamata entro 5 minuti).
 */
export async function optimizeCV(
  input: OptimizeCVInput,
): Promise<OptimizationResult> {
  const client = getClient();

  const response = await client.messages.create({
    model: CV_OPTIMIZATION_MODEL,
    max_tokens: 8000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content:
          USER_PROMPT_TEMPLATE(input.cvText, input.jobPosting) +
          buildSessionContextBlock(input.sessionContext) +
          buildPivaBlock(input.pivaContext) +
          buildCoverLetterHintsBlock(input.coverLetterHints),
      },
    ],
  });

  // Concatena tutti i blocchi testuali (Claude può spezzare l'output).
  const rawText = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  // Difesa extra: rimuovi eventuali code fence ```json``` se Claude
  // dovesse ignorare l'istruzione.
  const cleaned = stripCodeFence(rawText);

  try {
    const parsed = JSON.parse(cleaned) as OptimizationResult;
    validateShape(parsed);
    return parsed;
  } catch (err) {
    console.error(
      "[optimizeCV] Claude ha risposto con JSON non valido o schema errato.",
      {
        preview: cleaned.slice(0, 500),
        error: err instanceof Error ? err.message : String(err),
      },
    );
    throw new Error(
      "Claude ha risposto con un formato non valido. Riprova tra qualche secondo.",
    );
  }
}

function buildSessionContextBlock(ctx: string | null | undefined): string {
  if (!ctx || !ctx.trim()) return "";
  return `\n\n---
CONTESTO EXTRA DEL ROUND CORRENTE

L'utente ha avviato un round di candidature per uno specifico tipo di
ruolo e ha fornito questo contesto/esperienza extra da considerare
nella generazione del CV e della cover letter:

"""
${ctx.trim().slice(0, 2000)}
"""

Linee guida:
- Integra questo contesto nel CV ottimizzato in modo naturale, come se
  facesse parte del background del candidato. Aggiungi bullet
  pertinenti nelle experiences esistenti o, se chiaramente un'esperienza
  separata, crea una nuova entry "freelance/side project" sintetica.
- Usa il contesto anche nella cover letter, dove rilevante.
- NON inventare oltre quanto scritto: se manca un dato (durata, output,
  metriche), lascia generico invece di fabbricare.
`;
}

function buildPivaBlock(ctx: OptimizeCVInput["pivaContext"]): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.dailyRate) lines.push(`• Tariffa giornaliera indicativa: €${ctx.dailyRate}`);
  if (ctx.availableFrom) lines.push(`• Disponibilità: ${ctx.availableFrom}`);
  if (ctx.vatNumber) lines.push(`• Partita IVA: ${ctx.vatNumber} (italiana, fattura elettronica)`);
  if (ctx.portfolioUrl) lines.push(`• Portfolio: ${ctx.portfolioUrl}`);
  const bio = lines.length > 0 ? lines.join("\n") : "(nessun dato aggiuntivo fornito)";

  return `\n\n---
CANDIDATURA COME FREELANCE / P.IVA — MODALITÀ PITCH B2B

Non si tratta di una candidatura da dipendente. Il candidato è un
professionista con P.IVA italiana e si propone come consulente esterno
su un progetto/contract. Riscrivi di conseguenza:

1. coverLetter = pitch commerciale B2B, NON lettera motivazionale:
   - Prima persona, tono professionale ma diretto (come un consulente
     che risponde a un invito a offerta).
   - Apertura: posizionamento ("Sono un {ruolo} indipendente basato in
     Italia con P.IVA…") invece di "Sono entusiasta di candidarmi".
   - Corpo: 2-3 progetti passati rilevanti come prova di capacità
     (sintesi, outcome, metriche). NON dare per scontato continuity
     lavorativa.
   - Chiusura: offerta concreta con tariffa, disponibilità e prossimo
     passo ("Possiamo sentirci 20 minuti questa settimana per allineare
     scope e timeline?"). Niente "resto a disposizione".
   - Lunghezza: max 180-220 parole. Asciutto.
   - Lingua: italiano nativo (o inglese se l'annuncio è in inglese).

2. optimizedCV = stesso output strutturato ATS-friendly, MA:
   - Se il title del profilo è "Dipendente presso X", riscrivilo come
     "{Ruolo} — Freelance / Consulente" o simile.
   - Nelle experiences, quando possibile, inquadra le esperienze come
     "collaborazione" / "contract" / "consulenza" invece che "employee".
   - Non inventare: se il CV è chiaramente da dipendente, lascia le
     esperienze come sono ma aggiungi un'indicazione di apertura a
     progetti P.IVA nel summary.

3. Dati commerciali da integrare nel pitch (coverLetter):
${bio}

4. atsScore e suggestions restano come da schema.`;
}

function buildCoverLetterHintsBlock(hints: string[] | undefined): string {
  if (!hints || hints.length === 0) return "";
  return `\n\n---\nCOVER LETTER — CONCETTI EXTRA DA INTEGRARE:
Integra i seguenti punti nella cover letter in modo naturale e professionale.
NON copiarli letterali, non farli sembrare un inserto. Intrecciali nel flusso
come se fossero tuoi pensieri (prima persona, coerenti con il resto del testo).
Se un concetto non è pertinente al ruolo/settore dell'annuncio, ignoralo.

${hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}`;
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : text;
}

function validateShape(data: unknown): asserts data is OptimizationResult {
  if (!data || typeof data !== "object") {
    throw new Error("Root non è un oggetto");
  }
  const obj = data as Record<string, unknown>;
  if (!obj.optimizedCV || typeof obj.optimizedCV !== "object") {
    throw new Error("Manca optimizedCV");
  }
  if (typeof obj.coverLetter !== "string") {
    throw new Error("Manca coverLetter string");
  }
  if (typeof obj.atsScore !== "number") {
    throw new Error("Manca atsScore number");
  }
  if (!Array.isArray(obj.suggestions)) {
    throw new Error("Manca suggestions array");
  }
}
