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
        content: USER_PROMPT_TEMPLATE(input.cvText, input.jobPosting),
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
