import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiter wrapper con interfaccia comune.
 * - Prod: Upstash Redis (UPSTASH_REDIS_REST_URL + TOKEN)
 * - Dev: fallback in-memory (non distribuito)
 */

export interface LimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

export interface Limiter {
  limit(identifier: string): Promise<LimitResult>;
}

class InMemoryLimiter implements Limiter {
  private store = new Map<string, { count: number; reset: number }>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  async limit(identifier: string): Promise<LimitResult> {
    const now = Date.now();
    const entry = this.store.get(identifier);
    if (!entry || entry.reset < now) {
      const reset = now + this.windowMs;
      this.store.set(identifier, { count: 1, reset });
      return { success: true, remaining: this.max - 1, reset };
    }
    if (entry.count >= this.max) {
      return { success: false, remaining: 0, reset: entry.reset };
    }
    entry.count++;
    return {
      success: true,
      remaining: this.max - entry.count,
      reset: entry.reset,
    };
  }
}

class UpstashLimiter implements Limiter {
  constructor(private rl: Ratelimit) {}
  async limit(id: string): Promise<LimitResult> {
    const res = await this.rl.limit(id);
    return {
      success: res.success,
      remaining: res.remaining,
      reset: res.reset,
    };
  }
}

function buildLimiter(
  max: number,
  windowMs: number,
  prefix: string,
): Limiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const redis = new Redis({ url, token });
    return new UpstashLimiter(
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
        prefix,
        analytics: true,
      }),
    );
  }
  return new InMemoryLimiter(max, windowMs);
}

export const applyLimiter: Limiter = buildLimiter(10, 60 * 60 * 1000, "lavorai:apply");
// Apply-batch può fare molti chunk consecutivi sull'azione "applica a tutti".
// Limite generoso per supportare job board grandi (43 chunk × 100 job = 4300).
export const applyBatchLimiter: Limiter = buildLimiter(60, 60 * 60 * 1000, "lavorai:apply-batch");
export const authLimiter: Limiter = buildLimiter(5, 60 * 60 * 1000, "lavorai:auth");
export const uploadLimiter: Limiter = buildLimiter(10, 60 * 60 * 1000, "lavorai:upload");
