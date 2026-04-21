import { Queue, Worker, type Processor } from "bullmq";
import IORedis from "ioredis";

/**
 * BullMQ setup. Singleton connection + queue + worker factory.
 *
 * Env: REDIS_URL (rediss://... per Upstash TLS).
 * Nome queue: "applications".
 *
 * Web (Vercel) usa solo Queue per enqueue.
 * Worker (Railway) usa Worker + Processor per consumare.
 */

export const APPLICATIONS_QUEUE = "applications";

let cachedConnection: IORedis | null = null;
let cachedQueue: Queue<{ applicationId: string }> | null = null;

function connection(): IORedis {
  if (cachedConnection) return cachedConnection;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL non configurato — BullMQ non può avviarsi");
  }
  cachedConnection = new IORedis(url, {
    // BullMQ necessita maxRetriesPerRequest=null
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return cachedConnection;
}

export function getApplicationsQueue(): Queue<{ applicationId: string }> {
  if (cachedQueue) return cachedQueue;
  cachedQueue = new Queue<{ applicationId: string }>(APPLICATIONS_QUEUE, {
    connection: connection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 15_000 },
      removeOnComplete: { count: 100, age: 24 * 60 * 60 }, // ultimi 100 o 24h
      removeOnFail: { count: 500, age: 7 * 24 * 60 * 60 }, // ultimi 500 o 7g
    },
  });
  return cachedQueue;
}

export function createApplicationsWorker(
  processor: Processor<{ applicationId: string }>,
): Worker<{ applicationId: string }> {
  return new Worker<{ applicationId: string }>(APPLICATIONS_QUEUE, processor, {
    connection: connection(),
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
    // Lock rinnovato ogni 30s, scade dopo 5min se worker muore
    lockDuration: 5 * 60 * 1000,
    lockRenewTime: 30 * 1000,
  });
}

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}
