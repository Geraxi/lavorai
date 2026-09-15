import { prisma } from "@/lib/db";

export async function recordAiHealth(input: {
  provider: "openai" | "anthropic";
  ok: boolean;
  model?: string;
  source: string;
  message?: string;
  latencyMs?: number;
}): Promise<void> {
  try {
    await prisma.aiHealthState.upsert({
      where: { id: input.provider },
      create: {
        id: input.provider,
        status: input.ok ? "ok" : "down",
        model: input.model,
        source: input.source,
        message: input.message?.slice(0, 500),
        latencyMs: input.latencyMs,
        checkedAt: new Date(),
      },
      update: {
        status: input.ok ? "ok" : "down",
        model: input.model,
        source: input.source,
        message: input.message?.slice(0, 500),
        latencyMs: input.latencyMs,
        checkedAt: new Date(),
      },
    });
  } catch {
    // Health telemetry must not interfere with AI output.
  }
}
