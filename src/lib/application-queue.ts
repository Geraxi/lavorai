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

  // Fallback in-process (dev / MVP pre-queue)
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
