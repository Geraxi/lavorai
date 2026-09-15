import Anthropic from "@anthropic-ai/sdk";
import { isFailoverError, openai, providerOrder } from "@/lib/ai-router";
import { recordAiHealth } from "@/lib/ai-health-state";
import { parseModelJson, extractJsonBlock, stripFences } from "@/lib/model-json";
import type { OptimizationResult } from "@/types/cv";
import {
  SYSTEM_PROMPT,
  USER_PROMPT_TEMPLATE,
} from "@/lib/prompts/cv-optimization";

/**
 * Modello Anthropic usato solo come fallback dell'ottimizzazione CV.
 */
const CV_OPTIMIZATION_MODEL = "claude-sonnet-5";

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
   *  sua stessa piattaforma. Il modello le integra in modo naturale, non copia
   *  letterale. Ogni elemento è una istruzione/idea in linguaggio naturale.
   */
  coverLetterHints?: string[];
  /** Contesto/esperienza extra fornito dall'utente alla creazione del
   *  round (ApplicationSession.customContext). Iniettato nel modello per
   *  arricchire il CV con informazioni che il CV originale non contiene
   *  (es. side project, esperienze freelance non menzionate, ecc).
   *  Mai inventare: usa solo se l'utente l'ha scritto esplicitamente. */
  sessionContext?: string | null;
  /** Contesto P.IVA: se presente, il modello scrive un PITCH B2B invece di
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
 * Ottimizza il CV per un annuncio specifico. OpenAI è il provider primario;
 * Anthropic può essere usato come fallback se configurato.
 */
export async function optimizeCV(
  input: OptimizeCVInput,
): Promise<OptimizationResult> {
  const userContent =
    USER_PROMPT_TEMPLATE("", input.jobPosting).replace(/Ecco il CV originale[\s\S]*?<\/CV>\n\n/, "") +
    buildSessionContextBlock(input.sessionContext) +
    buildPivaBlock(input.pivaContext) +
    buildCoverLetterHintsBlock(input.coverLetterHints);

  const order = providerOrder("cv_optimization");
  for (const provider of order) {
    try {
      if (provider === "openai") return await optimizeWithOpenAI(input, userContent);
      return await optimizeWithAnthropic(input, userContent);
    } catch (err) {
      if (!isFailoverError(err) || provider === order[order.length - 1]) throw err;
      console.warn(
        `[optimizeCV] ${provider} fallito (${err instanceof Error ? err.message.slice(0, 80) : "?"}), passo al fallback`,
      );
    }
  }

  throw new Error("Nessun provider AI disponibile per l'ottimizzazione CV");
}

async function optimizeWithAnthropic(
  input: OptimizeCVInput,
  userContent: string,
): Promise<OptimizationResult> {
  const client = getClient();
  let lastErr: unknown = null;
  let lastPreview = "";
  let lastTruncated = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    // Streaming obbligatorio: con max_tokens ≥ ~21k l'SDK rifiuta le
    // chiamate non-stream ("Streaming is required for operations that may
    // take longer than 10 minutes"). finalMessage() ricompone la risposta.
    const response = await client.messages
      .stream({
        model: CV_OPTIMIZATION_MODEL,
        // 20k basta per CV + lettera; oltre è quasi sempre output degenerato.
        max_tokens: 20000,
        // Costo: il CV dell'utente va in un blocco di sistema CACHED. Il
        // worker elabora le candidature di uno stesso utente in sequenza,
        // quindi dalla seconda in poi i ~4-8k token del CV costano il 10%.
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: `Ecco il CV originale del candidato. Questo è l'UNICO contenuto verificato di cui dispone il candidato — qualsiasi cosa fuori da qui va considerata assente.\n\n<CV>\n${input.cvText}\n</CV>`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
      })
      .finalMessage();

    const truncated = response.stop_reason === "max_tokens";
    const rawText = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    const cleaned = stripCodeFence(rawText);

    try {
      const parsed = parseModelJson(cleaned) as OptimizationResult;
      validateShape(parsed);
      return parsed;
    } catch (err) {
      lastErr = err;
      lastPreview = cleaned.slice(0, 500);
      lastTruncated = truncated;
      console.error(
        `[optimizeCV] tentativo ${attempt}/2 — JSON non valido${truncated ? " (output TRONCATO: stop_reason=max_tokens)" : ""}.`,
        { preview: lastPreview, error: err instanceof Error ? err.message : String(err) },
      );
      // se troncato, non ha senso ritentare identico — fallisce uguale
      if (truncated) break;
    }
  }

  void lastErr;
  throw new Error(
    lastTruncated
      ? "Risposta AI troncata (CV troppo lungo). Riprova."
      : "Il servizio AI ha risposto con un formato non valido. Riprova tra qualche secondo.",
  );
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
  // Tollerante: fence ovunque + preamboli/code (vedi model-json.ts).
  return extractJsonBlock(stripFences(text));
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

/** Stessa pipeline (system prompt + CV + annuncio → JSON) su OpenAI. */
async function optimizeWithOpenAI(input: OptimizeCVInput, userContent: string): Promise<OptimizationResult> {
  const model = process.env.OPENAI_MODEL_STRONG ?? "gpt-5.6-terra";
  const startedAt = Date.now();
  try {
    const res = await openai().responses.create({
      model,
      max_output_tokens: 16000,
      store: false,
      instructions:
        SYSTEM_PROMPT +
        "\nRispondi esclusivamente con l'oggetto JSON richiesto.\n\n" +
        `Ecco il CV originale del candidato. Questo è l'UNICO contenuto verificato di cui dispone il candidato — qualsiasi cosa fuori da qui va considerata assente.\n\n<CV>\n${input.cvText}\n</CV>`,
      input: userContent,
      text: { format: { type: "json_object" } },
    });
    const raw = (res.output_text ?? "").trim();
    if (!raw) {
      throw new Error(
        `OpenAI empty response (${res.status}${res.incomplete_details?.reason ? `: ${res.incomplete_details.reason}` : ""})`,
      );
    }
    const parsed = parseModelJson(stripCodeFence(raw)) as OptimizationResult;
    validateShape(parsed);
    await recordAiHealth({
      provider: "openai",
      ok: true,
      model,
      source: "cv_optimization",
      latencyMs: Date.now() - startedAt,
    });
    console.log(`[optimizeCV] generato via openai/${model}`);
    return parsed;
  } catch (err) {
    await recordAiHealth({
      provider: "openai",
      ok: false,
      model,
      source: "cv_optimization",
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    });
    throw err;
  }
}
