import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { OptimizationResult } from "@/types/cv";

export type CardTrialPreviewResult = OptimizationResult & {
  ok: true;
  target: { jobId: string; title: string; company: string | null; location: string | null; matchedJob: true };
};
export type PreviewRow = {
  userId: string;
  jobId: string;
  state: "reserved" | "succeeded" | "failed";
  leaseId: string;
  leaseExpiresAt: Date;
  attempts?: number;
  result: CardTrialPreviewResult | null;
};
export interface PreviewStore {
  reserve(userId: string, jobId: string, leaseId: string): Promise<boolean>;
  read(userId: string): Promise<PreviewRow | null>;
  succeed(userId: string, leaseId: string, result: CardTrialPreviewResult): Promise<boolean>;
  fail(userId: string, leaseId: string): Promise<boolean>;
}
export class PreviewError extends Error {
  constructor(public readonly code: string, public readonly status = 409) { super(code); }
}
/** Only use when no usable output exists and no provider request is still in flight. */
export class DefinitePreviewFailure extends PreviewError {}

/** No expiration-based takeover: a dead worker may already have paid for a generation. */
export function createPreviewStore(db: Pick<PrismaClient, "$queryRaw" | "$executeRaw">): PreviewStore {
  return {
    async reserve(userId, jobId, leaseId) {
      const rows = await db.$queryRaw<Array<{ userId: string }>>`
        INSERT INTO "CardTrialPreview" ("userId", "jobId", "state", "leaseId", "leaseExpiresAt", "updatedAt")
        VALUES (${userId}, ${jobId}, 'reserved', ${leaseId}, NOW() + INTERVAL '2 minutes', NOW())
        ON CONFLICT ("userId") DO UPDATE SET
          "state" = 'reserved', "leaseId" = EXCLUDED."leaseId",
          "leaseExpiresAt" = EXCLUDED."leaseExpiresAt", "updatedAt" = NOW(), "attempts" = "CardTrialPreview"."attempts" + 1
        WHERE "CardTrialPreview"."attempts" < 3 AND "CardTrialPreview"."state" = 'failed' AND "CardTrialPreview"."jobId" = EXCLUDED."jobId"
        RETURNING "userId"`;
      return rows.length === 1;
    },
    async read(userId) {
      const rows = await db.$queryRaw<PreviewRow[]>`
        SELECT "userId", "jobId", "state", "leaseId", "leaseExpiresAt", "result", "attempts"
        FROM "CardTrialPreview" WHERE "userId" = ${userId}`;
      return rows[0] ?? null;
    },
    async succeed(userId, leaseId, result) {
      const count = await db.$executeRaw`
        UPDATE "CardTrialPreview" SET "state" = 'succeeded', "result" = ${JSON.stringify(result)}::jsonb,
          "updatedAt" = NOW()
        WHERE "userId" = ${userId} AND "leaseId" = ${leaseId} AND "state" = 'reserved'`;
      return count === 1;
    },
    async fail(userId, leaseId) {
      const count = await db.$executeRaw`
        UPDATE "CardTrialPreview" SET "state" = 'failed', "updatedAt" = NOW()
        WHERE "userId" = ${userId} AND "leaseId" = ${leaseId} AND "state" = 'reserved'`;
      return count === 1;
    },
  };
}

export async function runCardTrialPreview(input: {
  userId: string; jobId: string; store: PreviewStore;
  generate: () => Promise<CardTrialPreviewResult>;
}): Promise<CardTrialPreviewResult> {
  const { userId, jobId, store, generate } = input;
  const leaseId = randomUUID();
  if (!await store.reserve(userId, jobId, leaseId)) {
    const existing = await store.read(userId);
    if (!existing) throw new PreviewError("preview_reconciliation_required", 503);
    if (existing.jobId !== jobId) throw new PreviewError("preview_job_locked");
    if (existing.state === "succeeded" && existing.result) return existing.result;
    if (existing.state === "reserved" && existing.leaseExpiresAt.getTime() > Date.now()) {
      throw new PreviewError("preview_in_progress");
    }
    // Includes stale reservations, corrupted success rows, and concurrent failed transitions.
    throw new PreviewError("preview_reconciliation_required", 503);
  }
  let result: CardTrialPreviewResult;
  try {
    result = await generate();
  } catch (error) {
    if (error instanceof DefinitePreviewFailure) {
      if (!await store.fail(userId, leaseId)) throw new PreviewError("preview_reconciliation_required", 503);
      throw error;
    }
    // Timeout, dropped connection, process death, or unknown provider outcome: keep reserved.
    throw new PreviewError("preview_reconciliation_required", 503);
  }
  // Never release the reservation after a result exists, even if the DB acknowledgement is lost.
  try {
    if (!await store.succeed(userId, leaseId, result)) throw new Error("lease lost");
  } catch {
    throw new PreviewError("preview_reconciliation_required", 503);
  }
  return result;
}

/** Dedicated one-shot path: the legacy optimizer has retry/failover behavior unsuitable here. */
export async function generateCardTrialOptimization(cvText: string, jobPosting: string): Promise<OptimizationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL_STRONG;
  if (!apiKey || !model) throw new DefinitePreviewFailure("preview_provider_unavailable", 503);
  const [{ default: OpenAI }, { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE }, { z }] = await Promise.all([
    import("openai"), import("@/lib/prompts/cv-optimization"), import("zod"),
  ]);
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 45_000 });
  let response;
  try {
    response = await client.responses.create({
      model,
      max_output_tokens: 16000,
      store: false,
      instructions: SYSTEM_PROMPT + "\nRispondi esclusivamente con l'oggetto JSON richiesto.",
      input: USER_PROMPT_TEMPLATE(cvText, jobPosting),
      text: { format: { type: "json_object" } },
    });
  } catch (error) {
    // Only an explicit, definite rejection is safe to retry. 408/409/5xx/network errors are unknown.
    if (error instanceof OpenAI.APIError && [400, 401, 402, 403, 404, 413, 422, 429].includes(error.status ?? 0)) {
      throw new DefinitePreviewFailure("preview_generation_failed", 502);
    }
    throw error;
  }
  const stringList = z.array(z.string());
  const resultSchema = z.object({
    optimizedCV: z.object({
      fullName: z.string(), targetRole: z.string().optional(), email: z.string(), phone: z.string(),
      location: z.string(), linkedinUrl: z.string().nullable(), summary: z.string(),
      experiences: z.array(z.object({ role: z.string(), company: z.string(), location: z.string(), startDate: z.string(), endDate: z.string(), bullets: stringList })),
      education: z.array(z.object({ degree: z.string(), institution: z.string(), location: z.string(), startDate: z.string(), endDate: z.string(), notes: z.string().nullable() })),
      skills: z.object({ technical: stringList, soft: stringList, tools: stringList }),
      languages: z.array(z.object({ language: z.string(), level: z.string() })),
    }),
    coverLetter: z.string().min(1), atsScore: z.number().min(0).max(100), suggestions: stringList,
  });
  // A terminal but invalid output may still incur cost. Quarantine it without
  // consuming the successful allowance; an operator must reconcile/recover it.
  if (!["completed", "failed", "incomplete", "cancelled"].includes(response.status ?? "")) {
    throw new PreviewError("preview_reconciliation_required", 503);
  }
  if (response.status !== "completed") throw new PreviewError("preview_reconciliation_required", 503);
  try { return resultSchema.parse(JSON.parse(response.output_text)); }
  catch { throw new PreviewError("preview_reconciliation_required", 503); }
}
