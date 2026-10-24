/** Optional AI fallback (env INBOUND_AI_CLASSIFY=true). Only subject + truncated body are sent. */
import type { AiClassifier, InboundCategory } from "./classify";
import { MAILBOX_KINDS, mailboxKindFromAi } from "@/lib/application-mailbox";

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

/** Mailbox-kind AI. Low temperature. Never emits "rejection". */
export function mailboxAiClassifier(env: Record<string, string | undefined> = process.env): ((input: { subject: string; body: string }) => Promise<string | null>) | null {
  if (env.INBOUND_AI_CLASSIFY !== "true" || !(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY)) return null;
  const allowed = MAILBOX_KINDS.filter((k) => k !== "rejection").join(", ");
  return async ({ subject, body }) => {
    const { complete } = await import("@/lib/ai-router");
    const { text } = await complete({
      task: "email_extract", maxTokens: 50, json: true, temperature: 0,
      system: `Classify inbound job-application mail. Reply JSON {"kind": one of ${allowed}}. Never use "rejection". "We don't accept applications over email" / apply via portal = redirected_to_portal.`,
      user: `Subject: ${subject}\n\n${body.slice(0, 3000)}`,
    });
    return mailboxKindFromAi((JSON.parse(text) as { kind?: string }).kind);
  };
}
