import { processApplication } from "@/lib/application-worker";

/**
 * Queue abstraction per processare candidature.
 *
 * Modalità, scelte via env (priorità in ordine):
 *
 * 1. `REDIS_URL` set → **BullMQ** (target produzione consigliato).
 *    Enqueue su Redis, worker standalone (Railway/Render) consuma.
 *    Supporta retry, dead letter, concurrency, scheduling.
 *
 * 2. `INNGEST_EVENT_KEY` set → Inngest HTTP event.
 *
 * 3. `QSTASH_TOKEN` set → Upstash QStash HTTP.
 *
 * 4. Nessuno → in-process (solo dev / MVP).
 */

export async function enqueueApplication(applicationId: string): Promise<void> {
  // CRITICAL: If REDIS_URL is set, we MUST use BullMQ and MUST NOT silently
  // fall back. Silent fallback was the root cause of idle Railway worker —
  // jobs were going to HTTP self-invoke instead of Redis queue.
  if (process.env.REDIS_URL) {
    try {
      const { getApplicationsQueue } = await import("@/lib/bullmq-queue");
      const queue = getApplicationsQueue();
      const job = await queue.add(
        "process",
        { applicationId },
        {
          jobId: applicationId, // dedup: stesso app non enqueuato 2x
        },
      );
      // LOUD SUCCESS: confirm job was enqueued to Redis
      console.log(`[queue] ✓ Enqueued to BullMQ: app=${applicationId} job=${job.id} queue=${queue.name}`);
      return;
    } catch (err) {
      // FAIL LOUD: if REDIS_URL is set but enqueue fails, this is a critical
      // infrastructure error. Do NOT silently fall back to HTTP self-invoke —
      // that defeats the whole worker architecture and leaves Railway idle.
      console.error(`[queue] ❌ CRITICAL: BullMQ enqueue FAILED for app=${applicationId}`, err);
      console.error(`[queue] REDIS_URL is set but queue is broken. Worker will be IDLE. Fix Redis connection.`);
      
      // Mark application as failed so user sees error instead of stuck state
      try {
        const { prisma } = await import("@/lib/db");
        await prisma.application.update({
          where: { id: applicationId },
          data: {
            status: "failed",
            errorMessage: `Errore infrastruttura: impossibile accodare la candidatura (Redis connection failed). Contatta supporto.`,
            completedAt: new Date(),
          },
        });
      } catch (dbErr) {
        console.error(`[queue] Failed to mark app ${applicationId} as failed after Redis error`, dbErr);
      }
      
      // Re-throw to surface error to caller (API endpoint will return 500)
      throw new Error(`BullMQ enqueue failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (process.env.INNGEST_EVENT_KEY) {
    try {
      await fetch(`https://inn.gs/e/${process.env.INNGEST_EVENT_KEY}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "app/application.queued",
          data: { applicationId },
        }),
      });
      return;
    } catch (err) {
      console.error("[queue] Inngest enqueue failed, fallback in-process", err);
    }
  }

  if (process.env.QSTASH_TOKEN && process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      const callbackUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/applications/process`;
      await fetch(
        `https://qstash.upstash.io/v2/publish/${encodeURIComponent(callbackUrl)}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ applicationId }),
        },
      );
      return;
    } catch (err) {
      console.error("[queue] QStash enqueue failed, fallback in-process", err);
    }
  }

  // Fallback SERVERLESS: HTTP self-invoke.
  // Su Vercel l'in-process fallback era la causa root del "15 app stuck
  // in optimizing": il cron auto-apply creava 15 candidature e chiamava
  // `void processApplication()` per ognuna → tutte partivano dentro la
  // STESSA serverless function del cron (300s budget totale) → race +
  // timeout → tutte morte a metà con status "optimizing" persistito.
  //
  // Con self-invoke via HTTP, ogni candidatura innesca una nuova
  // serverless function con proprio budget 300s isolato. Se una fallisce
  // le altre continuano. Vercel gestisce la concurrency (fluid compute
  // riusa le istanze). Nessuna dipendenza da Redis/BullMQ/QStash.
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (baseUrl && process.env.NODE_ENV === "production") {
    const secret = process.env.APP_WORKER_SECRET ?? process.env.ADMIN_SYNC_KEY ?? "";
    try {
      // Fire-and-forget: non aspettare la risposta. La function chiamata
      // ha 300s tutti suoi per completare il processApplication.
      // HARDENED: se fetch() fallisce (network, timeout, etc), marchiamo
      // l'application come "failed" con errorMessage esplicito invece di
      // lasciare lo status "queued" silenzioso. L'utente vedrà "errore di
      // sistema" e può ritentare; noi loggiamo per diagnostica infra.
      void fetch(`${baseUrl}/api/applications/process`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(secret ? { "x-worker-secret": secret } : {}),
        },
        body: JSON.stringify({ applicationId }),
        // keepalive: la connessione può chiudersi prima della risposta
        // senza abortire la request lato server.
        keepalive: true,
      }).catch(async (err) => {
        console.error(`[queue] self-invoke failed for ${applicationId}`, err);
        // Mark application as failed so it doesn't stay stuck in "queued" forever
        try {
          const { prisma } = await import("@/lib/db");
          await prisma.application.update({
            where: { id: applicationId },
            data: {
              status: "failed",
              errorMessage: `Errore infrastruttura: impossibile avviare il worker (${err instanceof Error ? err.message : "network error"}). Riprova o contatta supporto.`,
              completedAt: new Date(),
            },
          });
        } catch (dbErr) {
          console.error(`[queue] failed to mark application ${applicationId} as failed`, dbErr);
        }
      });
      return;
    } catch (err) {
      console.error("[queue] self-invoke setup failed", err);
    }
  }

  // Ultimo fallback: in-process (SOLO dev locale — in prod pericoloso
  // perché la function del caller morirà con TIMEOUT + tutti gli app
  // in-flight persi).
  void processApplication(applicationId).catch((err) => {
    console.error("[queue] in-process worker error", err);
  });
}

/**
 * Cancella un job dalla coda (se ancora in waiting/active/delayed).
 * Best-effort: con backends diversi da BullMQ oggi non abbiamo cancel API
 * nativo, loggiamo e basta — il worker comunque salterà l'update perché
 * il record Application non esisterà più dopo la cancellazione account.
 */
export async function cancelApplication(applicationId: string): Promise<void> {
  if (!process.env.REDIS_URL) return;
  try {
    const { getApplicationsQueue } = await import("@/lib/bullmq-queue");
    const q = getApplicationsQueue();
    // jobId === applicationId per via della dedup in enqueue
    const job = await q.getJob(applicationId);
    if (job) {
      await job.remove();
    }
  } catch (err) {
    console.warn("[queue.cancel]", applicationId, err);
  }
}
