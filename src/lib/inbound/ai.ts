/** Optional AI fallback (env INBOUND_AI_CLASSIFY=true). Only subject + truncated body are sent. */
import type { AiClassifier, InboundCategory } from "./classify";

export function inboundAiClassifier(env: Record<string, string | undefined> = process.env): AiClassifier | null {
  if (env.INBOUND_AI_CLASSIFY !== "true" || !(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY)) return null;
  return async ({ subject, body }) => {
    const { complete } = await import("@/lib/ai-router");
    const { text } = await complete({
      task: "email_extract", maxTokens: 50, json: true, temperature: 0,
      system: 'Classify an email received by a job applicant. Reply JSON {"category": one of "confirmation" (application received), "incomplete" (action/verification needed, including "apply via our portal / we don\'t accept applications over email" — those are never rejection), "interview", "rejection", "other"}.',
      user: `Subject: ${subject}\n\n${body.slice(0, 3000)}`,
    });
    const c = (JSON.parse(text) as { category?: string }).category as InboundCategory | undefined;
    return c && ["confirmation", "incomplete", "interview", "rejection", "other"].includes(c) ? c : null;
  };
}
