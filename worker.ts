import { WorkerDrain } from "./src/lib/worker-drain";
import { sendersPaused } from "./src/lib/sender-hold";
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
 *  - REDIS_URL                    (solo se QUEUE_MODE=bullmq)
 *  - OPENAI_API_KEY               (AI CV optimization + ATS answers)
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
import { claimApplication, findClaimableQueued } from "./src/lib/application-claim";
import { applicationRolloutConfig, automaticApplicationsBlocked } from "./src/lib/application-rollout";
import { createAutoApplyTick, parseAutoApplyHours } from "./src/lib/auto-apply-schedule";
import { assertWorkerRuntime } from "./src/lib/worker-runtime";
import { applicationsPaused } from "./src/lib/application-pause";

async function main(): Promise<void> {
  assertWorkerRuntime(process.versions.node);
  console.log("[worker] runtime", JSON.stringify({ node: process.versions.node, commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown" }));
  const drain = new WorkerDrain();
  const rollout = applicationRolloutConfig();
  // Bounded public configuration only. Never log credentials or environment.
  console.log("[worker] application_sending_configuration", JSON.stringify({
    sendersPaused: sendersPaused(),
    mode: rollout.enabled ? rollout.mode : "closed", reason: rollout.reason,
    globalDailyCap: rollout.dailyCap, historicalCutoff: rollout.startedAt?.toISOString() ?? null,
    automaticProducers: !automaticApplicationsBlocked(), applicationsPaused: applicationsPaused(),
  }));
  const concurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2) || 2);
  const queueMode = process.env.QUEUE_MODE ?? "db";
  console.log(
    `[worker] concurrency=${concurrency}, auto-apply=${process.env.AUTO_APPLY_ENABLED ?? "false"}, queue=${queueMode}`,
  );

  // 1) BullMQ è opt-in. Il polling DB è il percorso predefinito: evita il
  //    rate-limit di Upstash e usa comunque claim atomici.
  let worker: ReturnType<typeof createApplicationsWorker> | null = null;
  if (queueMode === "bullmq" && process.env.REDIS_URL) {
    try {
      worker = createApplicationsWorker(async (job) => {
        if (drain.stopping) throw new Error("worker_draining");
        const id = job.data.applicationId;
        if (!(await claimApplication(id))) {
          console.log(`[worker] job ${job.id} già preso in carico altrove, skip`);
          return;
        }
        console.log(`[worker] processing job ${job.id} (applicationId=${id})`);
        await drain.run(() => processApplication(id), true);
        console.log(`[worker] completed job ${job.id}`);
      });
      worker.on("failed", (job, err) => {
        console.error(`[worker] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}):`, err.message);
      });
      worker.on("error", (err) => {
        console.error("[worker] bullmq error (continuo col polling DB):", err.message);
      });
      worker.on("ready", () => {
        console.log("[worker] connected to Redis, ready for jobs");
      });
    } catch (err) {
      console.error("[worker] BullMQ non avviato, uso solo il polling DB", err);
    }
  }

  // 2) Polling DB: ogni WORKER_POLL_MS prende le candidature `queued` non ancora
  //    in carico (claim atomico) e le elabora, fino a `concurrency` in parallelo.
  //    È la via che funziona SEMPRE, anche con Redis rate-limited.
  const pollMs = Math.max(5_000, Number(process.env.WORKER_POLL_MS ?? 15_000) || 15_000);
  let active = 0;
  console.log(`[worker] polling DB ogni ${pollMs / 1000}s`);
  const poll = async () => {
    if (drain.stopping || applicationsPaused() || active >= concurrency) return;
    try {
      const ids = await findClaimableQueued(concurrency - active);
      for (const id of ids) {
        if (drain.stopping || applicationsPaused()) break;
        if (!(await claimApplication(id))) continue;
        active++;
        console.log(`[worker] (poll) processing applicationId=${id} active=${active}`);
        drain.run(() => processApplication(id), true)
          .then(() => console.log(`[worker] (poll) completed ${id}`))
          .catch((err) => console.error(`[worker] (poll) ${id} failed:`, err instanceof Error ? err.message : err))
          .finally(() => { active--; });
      }
    } catch (err) {
      console.error("[worker] poll error:", err instanceof Error ? err.message : err);
    }
  };
  const trackedPoll = () => { if (!drain.stopping) void drain.run(poll).catch(err => console.error("[worker] poll", err)); };
  trackedPoll();
  const pollTimer = setInterval(trackedPoll, pollMs);

  // Scheduler auto-apply nel worker (processo persistente): 3 batch/giorno
  // alle ore UTC in AUTO_APPLY_HOURS (default "8,12,16"). Vercel Hobby non
  // permette cron più frequenti di 1/giorno, quindi la cadenza promessa in
  // dashboard vive qui. Disattivabile con WORKER_AUTO_APPLY_CRON=false.
  let autoApplyTimer: ReturnType<typeof setInterval> | undefined;
  if ((process.env.WORKER_AUTO_APPLY_CRON ?? "true") !== "false") {
    const hours = parseAutoApplyHours(process.env.AUTO_APPLY_HOURS);
    console.log(`[worker] auto-apply scheduler attivo alle ore UTC ${hours.join(",")}`);
    const tick = createAutoApplyTick({
      hours, blocked: () => applicationsPaused() || automaticApplicationsBlocked(),
      run: async () => {
        try {
          // Users who uploaded a CV but never opened /cv had no CVProfile and
          // were skipped by the job below; create theirs first (bounded).
          const { backfillMissingCvProfiles } = await import("./src/lib/cv-profile-ensure");
          await backfillMissingCvProfiles({ max: 100, budgetMs: 10 * 60_000 })
            .catch((err) => console.error("[worker] CV profile backfill failed", err instanceof Error ? err.message : err));
          const { runAutoApplyCron } = await import("./src/lib/auto-apply-cron");
          const t0 = Date.now();
          const stats = await runAutoApplyCron();
          console.log(`[worker] auto-apply cron ${Date.now() - t0}ms`, stats);
          console.log(`[worker] auto-apply funnel candidates=${stats.candidatesFetched} location=${stats.skippedLocationMismatch} locationUnverified=${stats.skippedLocationUnverified} contract=${stats.skippedEmploymentMismatch} salary=${stats.skippedSalaryMismatch} title=${stats.skippedRoleMismatch} score=${stats.skippedMatchThreshold} enqueued=${stats.applicationsEnqueued} awaitingConsent=${stats.applicationsAwaitingConsent}`);
        } catch (err) {
          console.error("[worker] auto-apply cron failed", err);
        }
      },
    });
    const trackedTick = () => { if (!drain.stopping) void drain.run(tick).catch(err => console.error("[worker] scheduler", err)); };
    trackedTick();
    autoApplyTimer = setInterval(trackedTick, 60_000);
  }

  // Rows held on a temporary "job availability couldn't be checked" result are
  // re-checked with backoff (held-application-release.ts). Never a replay:
  // only rows with zero prior-submission evidence; admission re-gates all.
  const livenessMs = Math.max(5 * 60_000, Number(process.env.LIVENESS_RECHECK_INTERVAL_MS ?? 30 * 60_000) || 30 * 60_000);
  const livenessWork = async () => {
    try {
      const { recheckLivenessHeldApplications } = await import("./src/lib/held-application-release");
      await recheckLivenessHeldApplications({ limit: 25 });
    } catch (err) {
      console.error("[worker] liveness recheck failed", err instanceof Error ? err.message : err);
    }
  };
  const livenessTimer = setInterval(() => { if (!drain.stopping && !applicationsPaused()) void drain.run(livenessWork).catch(err => console.error("[worker] liveness", err)); }, livenessMs);

  // Notification-only retry pump: never invokes an application submission.
  let emailPumpRunning = false;
  const emailPump = async () => {
    if (emailPumpRunning || drain.stopping || sendersPaused()) return;
    emailPumpRunning = true;
    try {
      const { drainEmailNotifications } = await import("./src/lib/email-outbox");
      const { retryPendingApplicationSentNotifications } = await import("./src/lib/application-sent-notification");
      await retryPendingApplicationSentNotifications();
      await drainEmailNotifications();
    } catch (error) { console.error("[worker] notification retry failed", error instanceof Error ? error.message : "unknown"); }
    finally { emailPumpRunning = false; }
  };
  const trackedEmailPump = () => { if (!drain.stopping) void drain.run(emailPump).catch(err => console.error("[worker] email pump", err)); };
  const emailTimer = setInterval(trackedEmailPump, 30_000);
  trackedEmailPump();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    if (drain.stopping) return;
    drain.stopping = true;
    console.log(`[worker] ${signal} received, draining... pending=${drain.pending}`);
    clearInterval(pollTimer);
    clearInterval(emailTimer);
    if (autoApplyTimer) clearInterval(autoApplyTimer);
    clearInterval(livenessTimer);
    if (worker) await worker.close();
    await drain.close();
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
