/**
 * Worker standalone per processare candidature in background.
 *
 * Run target: Railway/Render container con Playwright installato.
 * Condivide codebase con Next.js app ma NON richiede il server Next.
 *
 * Start: `node --loader tsx worker.ts` (dev) o dopo `tsc` (prod).
 * In Dockerfile.worker: `CMD ["node", "dist/worker.js"]`.
 *
 * Env richieste:
 *  - DATABASE_URL                 (stesso del web)
 *  - REDIS_URL                    (BullMQ)
 *  - ANTHROPIC_API_KEY            (Claude CV optimization)
 *  - RESEND_API_KEY + EMAIL_FROM  (email delivery)
 *  - SUPABASE_URL + SERVICE_ROLE_KEY + STORAGE_BUCKET  (storage CV)
 *  - APP_ENCRYPTION_KEY           (decrypt cookie portali)
 *  - AUTO_APPLY_ENABLED=true      (abilita Playwright submit)
 *  - NEXT_PUBLIC_SITE_URL         (per email template)
 *  - WORKER_CONCURRENCY=2         (opzionale, default 2)
 */

// Carica .env / .env.local in dev. In prod (Railway) le env sono già injectate.
// override:true forza sovrascrittura di env vars già esistenti (es. shell vuota).
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env", override: false });

import { createApplicationsWorker } from "./src/lib/bullmq-queue";
import { processApplication } from "./src/lib/application-worker";

async function main(): Promise<void> {
  if (!process.env.REDIS_URL) {
    console.error("[worker] REDIS_URL mancante — impossibile avviare BullMQ");
    process.exit(1);
  }

  console.log("[worker] avvio BullMQ worker su queue 'applications'");
  console.log(
    `[worker] concurrency=${process.env.WORKER_CONCURRENCY ?? 2}, auto-apply=${process.env.AUTO_APPLY_ENABLED ?? "false"}`,
  );

  const worker = createApplicationsWorker(async (job) => {
    console.log(`[worker] processing job ${job.id} (applicationId=${job.data.applicationId})`);
    await processApplication(job.data.applicationId);
    console.log(`[worker] completed job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[worker] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}):`,
      err.message,
    );
  });
  worker.on("error", (err) => {
    console.error("[worker] worker error:", err);
  });
  worker.on("ready", () => {
    console.log("[worker] connected to Redis, ready for jobs");
  });

  // Scheduler auto-apply nel worker (processo persistente): 3 batch/giorno
  // alle ore UTC in AUTO_APPLY_HOURS (default "8,12,16"). Vercel Hobby non
  // permette cron più frequenti di 1/giorno, quindi la cadenza promessa in
  // dashboard vive qui. Disattivabile con WORKER_AUTO_APPLY_CRON=false.
  if ((process.env.WORKER_AUTO_APPLY_CRON ?? "true") !== "false") {
    const hours = (process.env.AUTO_APPLY_HOURS ?? "8,12,16")
      .split(",")
      .map((h) => Number(h.trim()))
      .filter((h) => Number.isInteger(h) && h >= 0 && h < 24);
    let lastRunKey = "";
    console.log(`[worker] auto-apply scheduler attivo alle ore UTC ${hours.join(",")}`);
    setInterval(async () => {
      const now = new Date();
      const key = `${now.toISOString().slice(0, 10)}T${now.getUTCHours()}`;
      if (!hours.includes(now.getUTCHours()) || now.getUTCMinutes() > 4 || key === lastRunKey) return;
      lastRunKey = key;
      try {
        const { runAutoApplyCron } = await import("./src/lib/auto-apply-cron");
        const t0 = Date.now();
        const stats = await runAutoApplyCron();
        console.log(`[worker] auto-apply cron ${Date.now() - t0}ms`, stats);
      } catch (err) {
        console.error("[worker] auto-apply cron failed", err);
      }
    }, 60_000);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, draining...`);
    await worker.close();
    console.log("[worker] closed cleanly");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
