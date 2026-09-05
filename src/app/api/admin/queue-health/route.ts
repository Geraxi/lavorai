import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * Admin diagnostic endpoint: verifies queue infrastructure health.
 * 
 * Returns:
 * - Redis connectivity status
 * - Queue stats (waiting, active, completed, failed)
 * - Environment configuration
 * 
 * Use this to diagnose "idle worker" issues where Vercel and Railway
 * are misconfigured (different REDIS_URL or missing env var).
 */
export async function GET(request: NextRequest) {
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const auth = request.headers.get("x-admin-key");

  if (!adminKey || auth !== adminKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? "vercel" : "other",
    redis: {
      configured: Boolean(process.env.REDIS_URL),
      url: process.env.REDIS_URL
        ? `${process.env.REDIS_URL.split("@")[1] || "***"}` // Show host only, hide credentials
        : null,
    },
    queue: null,
    error: null,
  };

  if (!process.env.REDIS_URL) {
    result.error = "REDIS_URL not configured - BullMQ disabled, falling back to HTTP self-invoke";
    return NextResponse.json(result, { status: 200 });
  }

  try {
    const { getApplicationsQueue, isRedisConfigured } = await import("@/lib/bullmq-queue");
    
    if (!isRedisConfigured()) {
      result.error = "Redis not configured properly";
      return NextResponse.json(result, { status: 200 });
    }

    const queue = getApplicationsQueue();
    
    // Test connection and get queue stats
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    result.queue = {
      name: queue.name,
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
      healthy: true,
    };

    // Try to ping Redis directly
    const connection = (queue as any).client;
    if (connection && typeof connection.ping === 'function') {
      const pong = await connection.ping();
      result.redis.ping = pong;
    }

    console.log(`[queue-health] ✓ Redis healthy - queue stats:`, result.queue);
    
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.queue = { healthy: false };
    
    console.error(`[queue-health] ❌ Redis connection failed:`, err);
    
    return NextResponse.json(result, { status: 503 });
  }
}
