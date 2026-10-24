/**
 * Bounded one-time recruiter-email recheck for skip-list handoffs created
 * before employer-domain discovery. Each row is attempted at most once
 * (Application.recruiterEmailRecheckedAt). No hand-edited data.
 */
import { prisma } from "@/lib/db";
import { enqueueApplication } from "@/lib/application-queue";
import { SKIPPED_ATS_MANUAL_MESSAGE, isSkippedPortalUrl } from "@/lib/ats-skip-hosts";
import { lookupPublishedSkipListInbox } from "@/lib/skip-list-email-lookup";

export const SKIP_LIST_RECHECK_LIMIT = 20;

export type SkipListRecheckReport = {
  checked: number;
  found: number;
  missed: number;
};

type RecheckDb = {
  application: {
    findMany: (args: unknown) => Promise<Array<Record<string, any>>>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  job: {
    update: (args: unknown) => Promise<unknown>;
  };
};

export async function recheckSkippedAtsHandoffs(opts: {
  limit?: number;
  now?: Date;
  db?: RecheckDb;
  lookup?: typeof lookupPublishedSkipListInbox;
  enqueue?: (id: string) => Promise<void>;
} = {}): Promise<SkipListRecheckReport> {
  const report: SkipListRecheckReport = { checked: 0, found: 0, missed: 0 };
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const take = Math.min(40, Math.max(1, opts.limit ?? SKIP_LIST_RECHECK_LIMIT));
  const lookup = opts.lookup ?? lookupPublishedSkipListInbox;
  const enqueue = opts.enqueue ?? enqueueApplication;

  const rows = await db.application.findMany({
    where: {
      status: "ready_to_apply",
      errorMessage: SKIPPED_ATS_MANUAL_MESSAGE,
      recruiterEmailRecheckedAt: null,
      submittedAt: null,
      submittedVia: null,
      sendStatus: "not_sent",
      canaryLog: null,
      answersUsedJson: null,
    },
    select: {
      id: true,
      job: {
        select: {
          id: true,
          url: true,
          company: true,
          description: true,
          recruiterEmail: true,
          recruiterEmailSourceUrl: true,
          companyWebsite: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take,
  });

  for (const row of rows) {
    const claimed = await db.application.updateMany({
      where: {
        id: row.id,
        status: "ready_to_apply",
        errorMessage: SKIPPED_ATS_MANUAL_MESSAGE,
        recruiterEmailRecheckedAt: null,
        submittedAt: null,
        submittedVia: null,
        sendStatus: "not_sent",
      },
      data: { recruiterEmailRecheckedAt: now },
    });
    if (claimed.count !== 1) continue;
    report.checked++;

    if (!isSkippedPortalUrl(row.job.url)) {
      report.missed++;
      continue;
    }

    const hit = await lookup(row.job).catch(() => null);
    if (!hit) {
      report.missed++;
      continue;
    }

    await db.job.update({
      where: { id: row.job.id },
      data: {
        recruiterEmail: hit.email,
        recruiterEmailSourceUrl: hit.provenance.sourceUrl,
        recruiterScrapedAt: now,
      },
    }).catch(() => undefined);

    const reopened = await db.application.updateMany({
      where: {
        id: row.id,
        status: "ready_to_apply",
        errorMessage: SKIPPED_ATS_MANUAL_MESSAGE,
        submittedAt: null,
        submittedVia: null,
        sendStatus: "not_sent",
      },
      data: {
        status: "queued",
        errorMessage: null,
        completedAt: null,
        startedAt: null,
      },
    });
    if (reopened.count !== 1) {
      report.missed++;
      continue;
    }
    await enqueue(row.id).catch(() => undefined);
    report.found++;
  }

  return report;
}
