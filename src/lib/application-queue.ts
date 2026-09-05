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
  if (process.env.REDIS_URL) {
    try {
      const { getApplicationsQueue } = await import("@/lib/bullmq-queue");
      await getApplicationsQueue().add(
        "process",
        { applicationId },
        {
          jobId: applicationId, // dedup: stesso app non enqueuato 2x
        },
      );
      console.log(`[queue] enqueued via bullmq app=${applicationId}`);
      return;
    } catch (err) {
      console.error("[queue] BullMQ enqueue failed, fallback in-process", err);
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
      }).catch((err) => {
        console.error(`[queue] self-invoke failed for ${applicationId}`, err);
      });
      console.log(`[queue] enqueued via self-invoke app=${applicationId} (REDIS_URL ${process.env.REDIS_URL ? "set but failed" : "not set"})`);
      return;
    } catch (err) {
      console.error("[queue] self-invoke setup failed", err);
    }
  }

  // Ultimo fallback: in-process (SOLO dev locale — in prod pericoloso
  // perché la function del caller morirà con TIMEOUT + tutti gli app
  // in-flight persi).
  console.warn(`[queue] enqueued via in-process app=${applicationId} (solo dev)`);
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
