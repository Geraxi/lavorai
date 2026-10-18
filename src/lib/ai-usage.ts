import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/db";

/**
 * Token usage recorder for AI provider calls (server/worker only).
 *
 * - Fire-and-forget: never awaited by the caller's critical path, never
 *   throws. If the AiUsageEvent table does not exist yet (schema not
 *   applied), the write fails silently and nothing else changes.
 * - Stores tokens only. No prompt, CV, answer or user identifier.
 * - The worker binds the current applicationId with withAiUsageContext so
 *   cost per application can be estimated; other calls are unlinked.
 */
type AiUsageContext = { applicationId?: string };
const storage = new AsyncLocalStorage<AiUsageContext>();

export function withAiUsageContext<T>(context: AiUsageContext, run: () => Promise<T>): Promise<T> {
  return storage.run(context, run);
}

export interface ProviderUsage { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null }

const int = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);

/** OpenAI Responses API `usage` or Anthropic Messages `usage` → common shape. */
export function normalizeUsage(provider: "openai" | "anthropic", usage: unknown): ProviderUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, any>;
  if (provider === "openai") {
    return { inputTokens: int(u.input_tokens ?? u.prompt_tokens), outputTokens: int(u.output_tokens ?? u.completion_tokens),
      cachedInputTokens: int(u.input_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached_tokens) };
  }
  const cacheRead = int(u.cache_read_input_tokens);
  const cacheWrite = int(u.cache_creation_input_tokens);
  const fresh = int(u.input_tokens);
  return { inputTokens: fresh === null && cacheRead === null && cacheWrite === null ? null : (fresh ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0),
    outputTokens: int(u.output_tokens), cachedInputTokens: cacheRead };
}

export function recordAiUsage(input: { task: string; provider: "openai" | "anthropic"; model: string; usage: unknown }): void {
  try {
    const usage = normalizeUsage(input.provider, input.usage);
    if (!usage) return;
    const applicationId = storage.getStore()?.applicationId;
    void prisma.aiUsageEvent.create({ data: {
      task: input.task.slice(0, 40), provider: input.provider, model: input.model.slice(0, 80),
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedInputTokens: usage.cachedInputTokens,
      applicationId: applicationId ?? null,
    } }).catch(() => void 0);
  } catch { /* measurement never breaks the product */ }
}
