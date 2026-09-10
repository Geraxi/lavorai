import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/**
 * Router AI multi-provider. Ogni feature ("task") ha un provider+modello
 * primario e uno di fallback; se il primario fallisce per crediti, rate
 * limit o errore server, si passa al secondario. Per i task pesanti si può
 * ripartire il traffico tra i due provider (AI_SPLIT_<TASK>=percentuale
 * verso OpenAI) così i crediti si consumano in modo bilanciato.
 *
 * Env:
 *   ANTHROPIC_API_KEY, OPENAI_API_KEY
 *   OPENAI_MODEL_STRONG (default gpt-4.1), OPENAI_MODEL_FAST (default gpt-4.1-mini)
 *   ANTHROPIC_MODEL_STRONG (default claude-sonnet-5), ANTHROPIC_MODEL_FAST (default claude-haiku-4-5-20251001)
 *   AI_SPLIT_CV_OPTIMIZATION=0..100  → quota di CV/lettere generati da OpenAI (default 0)
 *   AI_TASK_<TASK>=anthropic|openai   → forza il primario di un task
 */

export type AiTask =
  | "cv_optimization"   // CV + lettera per annuncio (pesante, qualità alta)
  | "cv_profile_full"   // estrazione profilo completa (una tantum)
  | "cv_profile_quick"  // parse rapido
  | "form_answers"      // risposte ai form ATS
  | "email_extract"     // trova l'email del recruiter in una pagina
  | "interview"         // interview buddy / copilot
  | "founder_coach"
  | "admin_assistant";

type Provider = "anthropic" | "openai";
type Tier = "strong" | "fast";

const TASK_DEFAULTS: Record<AiTask, { primary: Provider; tier: Tier }> = {
  cv_optimization: { primary: "anthropic", tier: "strong" },
  cv_profile_full: { primary: "anthropic", tier: "strong" },
  cv_profile_quick: { primary: "openai", tier: "fast" },
  form_answers: { primary: "openai", tier: "fast" },
  email_extract: { primary: "openai", tier: "fast" },
  interview: { primary: "openai", tier: "strong" },
  founder_coach: { primary: "anthropic", tier: "strong" },
  admin_assistant: { primary: "anthropic", tier: "strong" },
};

function model(provider: Provider, tier: Tier): string {
  if (provider === "openai") return tier === "strong" ? process.env.OPENAI_MODEL_STRONG ?? "gpt-4.1" : process.env.OPENAI_MODEL_FAST ?? "gpt-4.1-mini";
  return tier === "strong" ? process.env.ANTHROPIC_MODEL_STRONG ?? "claude-sonnet-5" : process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5-20251001";
}

function available(p: Provider): boolean {
  return p === "openai" ? !!process.env.OPENAI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
}

/** Ordine provider per un task: forzatura env → split percentuale → default; il secondo è il fallback. */
export function providerOrder(task: AiTask): Provider[] {
  const forced = process.env[`AI_TASK_${task.toUpperCase()}`] as Provider | undefined;
  let primary: Provider = forced === "openai" || forced === "anthropic" ? forced : TASK_DEFAULTS[task].primary;
  const split = Number(process.env[`AI_SPLIT_${task.toUpperCase()}`] ?? 0);
  if (!forced && split > 0 && Math.random() * 100 < split) primary = "openai";
  const other: Provider = primary === "openai" ? "anthropic" : "openai";
  return [primary, other].filter(available);
}

/** Errori per cui ha senso passare al provider successivo. */
export function isFailoverError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = (err as { status?: number })?.status;
  return status === 429 || status === 402 || (status != null && status >= 500) || /credit|quota|rate limit|overloaded|insufficient|billing|529/.test(msg);
}

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;
export function anthropic(): Anthropic { return (anthropicClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })); }
export function openai(): OpenAI { return (openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })); }

export interface CompleteInput {
  task: AiTask;
  system: string;
  user: string;
  maxTokens: number;
  /** Chiedi JSON puro (OpenAI: response_format json_object). */
  json?: boolean;
  temperature?: number;
}

/**
 * Completamento testuale con failover. Ritorna il testo e il provider usato.
 * Per l'ottimizzazione CV con cache Anthropic usare direttamente claude.ts;
 * questo helper copre i task "semplici" (system + un messaggio utente).
 */
export async function complete(input: CompleteInput): Promise<{ text: string; provider: Provider; model: string }> {
  const order = providerOrder(input.task);
  if (order.length === 0) throw new Error("Nessun provider AI configurato (ANTHROPIC_API_KEY / OPENAI_API_KEY)");
  let lastErr: unknown = null;
  for (const p of order) {
    const m = model(p, TASK_DEFAULTS[input.task].tier);
    try {
      if (p === "openai") {
        const res = await openai().chat.completions.create({
          model: m,
          max_completion_tokens: input.maxTokens,
          temperature: input.temperature,
          ...(input.json ? { response_format: { type: "json_object" as const } } : {}),
          messages: [
            { role: "system", content: input.system + (input.json ? "\nRispondi esclusivamente con un oggetto JSON valido." : "") },
            { role: "user", content: input.user },
          ],
        });
        const text = res.choices[0]?.message?.content ?? "";
        return { text, provider: p, model: m };
      }
      const res = await anthropic().messages.create({
        model: m,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      });
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return { text, provider: p, model: m };
    } catch (err) {
      lastErr = err;
      if (!isFailoverError(err) || p === order[order.length - 1]) throw err;
      console.warn(`[ai-router] ${input.task}: ${p}/${m} fallito (${err instanceof Error ? err.message.slice(0, 80) : "?"}), passo al fallback`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI: nessun provider disponibile");
}
