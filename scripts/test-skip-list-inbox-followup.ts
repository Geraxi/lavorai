/**
 * Follow-up to #95: published website JSON, cheap skip-list lookup, one-time
 * handoff recheck. Fakes only — no HTTP, Resend, or production DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ashbyCompanyWebsite } from "../src/lib/scrapers/ashby";
import { greenhouseCompanyWebsite } from "../src/lib/scrapers/greenhouse";
import { leverCompanyWebsite } from "../src/lib/scrapers/lever";
import { companyWebsiteFromPublishedSource } from "../src/lib/recruiter-email";
import { lookupPublishedSkipListInbox } from "../src/lib/skip-list-email-lookup";
import { recheckSkippedAtsHandoffs } from "../src/lib/skip-list-handoff-recheck";
import { SKIPPED_ATS_MANUAL_MESSAGE } from "../src/lib/ats-skip-hosts";
import {
  genericCompanyContactReason,
  postingNamesApplyAddress,
  postingSpecificRecruiterDecision,
  recruiterEmailFallbackEnabled,
} from "../src/lib/recruiter-email-fallback";

async function testPublishedWebsites() {
  assert.equal(
    ashbyCompanyWebsite({ publicWebsite: "https://elevenlabs.io", customJobsPageUrl: "https://elevenlabs.io/careers" }, "ElevenLabs"),
    "https://elevenlabs.io/",
  );
  assert.equal(
    ashbyCompanyWebsite({ publicWebsite: "https://jobs.ashbyhq.com/elevenlabs" }, "ElevenLabs"),
    null,
    "Ashby tenant URL is not an employer site",
  );
  assert.equal(
    greenhouseCompanyWebsite({
      content: '<script type="application/ld+json">{"@type":"JobPosting","hiringOrganization":{"sameAs":["https://linkedin.com/company/acme","https://acme.com"]}}</script>',
      absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
    }, "Acme"),
    "https://acme.com/",
  );
  assert.equal(
    greenhouseCompanyWebsite({ content: "", absolute_url: "https://careers.acme.com/jobs/1" }, "Acme"),
    "https://careers.acme.com/",
  );
  assert.equal(
    leverCompanyWebsite({
      description: '<script type="application/ld+json">{"hiringOrganization":{"url":"https://www.acme.com"}}</script>',
      hostedUrl: "https://jobs.lever.co/acme/uuid",
    }, "Acme"),
    "https://www.acme.com/",
  );
  assert.equal(companyWebsiteFromPublishedSource("acme", "Acme"), null);
}

async function testCheapLookup() {
  const hit = await lookupPublishedSkipListInbox({
    url: "https://jobs.ashbyhq.com/acme/uuid",
    company: "Acme",
    description: "Send your CV to careers@acme.com for this role.",
    companyWebsite: "https://www.acme.com",
  }, {
    findVerified: async (_url, _company, _cached, extras) => {
      assert.equal(extras?.skipPageFetch, true, "Cheap lookup must skip the ATS page crawl");
      assert.equal(extras?.companyWebsite, "https://www.acme.com");
      return {
        email: "careers@acme.com",
        provenance: {
          version: 1, sourceType: "job_description", requestedUrl: _url, sourceUrl: _url,
          observedAt: "2026-10-24T12:00:00.000Z", pageSha256: "x", evidence: "Send your CV",
          company: "Acme", extraction: "job_description",
        },
      };
    },
    discover: async () => { throw new Error("discover should be injected, not the network default"); },
  });
  assert.equal(hit?.email, "careers@acme.com");

  const miss = await lookupPublishedSkipListInbox({
    url: "https://jobs.ashbyhq.com/acme/uuid",
    company: "Acme",
    description: "Apply on the site.",
  }, {
    findVerified: async (_url, _company, _cached, extras) => {
      assert.equal(extras?.skipPageFetch, true);
      return null;
    },
  });
  assert.equal(miss, null);

  const greenhouse = await lookupPublishedSkipListInbox({
    url: "https://boards.greenhouse.io/acme/jobs/1",
    company: "Acme",
    description: "Send your CV to careers@acme.com.",
  }, {
    findVerified: async () => { throw new Error("non-skip-list must not look up"); },
  });
  assert.equal(greenhouse, null);
}

async function testOneTimeRecheck() {
  const now = new Date("2026-10-24T12:00:00.000Z");
  const rows = [
    {
      id: "pre95",
      job: {
        id: "job-ashby", url: "https://jobs.ashbyhq.com/acme/uuid", company: "Acme",
        description: "Apply on the site.", recruiterEmail: null, recruiterEmailSourceUrl: null,
        companyWebsite: "https://www.acme.com",
      },
    },
    {
      id: "already",
      job: {
        id: "job-2", url: "https://jobs.ashbyhq.com/acme/uuid", company: "Acme",
        description: "", recruiterEmail: null, recruiterEmailSourceUrl: null, companyWebsite: null,
      },
    },
  ];
  const claimed = new Set<string>();
  const updates: Array<Record<string, unknown>> = [];
  const enqueued: string[] = [];
  const db = {
    application: {
      findMany: async () => [rows[0]],
      updateMany: async ({ where, data }: { where: { id: string; recruiterEmailRecheckedAt?: null }; data: Record<string, unknown> }) => {
        if (where.recruiterEmailRecheckedAt === null && claimed.has(where.id)) return { count: 0 };
        if (where.recruiterEmailRecheckedAt === null) claimed.add(where.id);
        updates.push({ id: where.id, ...data });
        return { count: 1 };
      },
    },
    job: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push({ job: true, ...data });
        return data;
      },
    },
  };
  const first = await recheckSkippedAtsHandoffs({
    now, db, limit: 8,
    lookup: async () => ({
      email: "talent@acme.com",
      provenance: {
        version: 1, sourceType: "employer_domain_page", requestedUrl: rows[0].job.url,
        sourceUrl: "https://acme.com/careers", observedAt: now.toISOString(), pageSha256: "x",
        evidence: "Send your CV to talent@acme.com", company: "Acme",
        extraction: "visible_application_instruction",
      },
    }),
    enqueue: async (id) => { enqueued.push(id); },
  });
  assert.equal(first.checked, 1);
  assert.equal(first.found, 1);
  assert.equal(first.queued, 0, "fallback off: record the address, do not queue");
  assert.equal(first.rejected, 1);
  assert.equal(enqueued.join(","), "");
  assert.ok(!updates.some((u) => u.status === "queued"));
  assert.ok(updates.some((u) => u.recruiterEmail === "talent@acme.com"));
  assert.ok(updates.some((u) => u.sendFailureReason === "recruiter_email_fallback_disabled"));

  const second = await recheckSkippedAtsHandoffs({
    now, db, limit: 8,
    lookup: async () => { throw new Error("must not look up a row already marked"); },
    enqueue: async () => { throw new Error("must not enqueue twice"); },
  });
  assert.equal(second.checked, 0, "Timestamp makes the recheck idempotent");
  assert.equal(enqueued.length, 0);

  const missDb = {
    application: {
      findMany: async () => [rows[0]],
      updateMany: async () => ({ count: 1 }),
    },
    job: { update: async () => { throw new Error("miss must not persist an invented inbox"); } },
  };
  const missed = await recheckSkippedAtsHandoffs({
    now, db: missDb, lookup: async () => null, enqueue: async () => { throw new Error("miss must not enqueue"); },
  });
  assert.equal(missed.checked, 1);
  assert.equal(missed.found, 0);
  assert.equal(missed.missed, 1);
  assert.equal(missed.queued, 0);
  assert.equal(SKIPPED_ATS_MANUAL_MESSAGE.length > 20, true);
}

function testRecruiterEmailFallbackPolicy() {
  assert.equal(recruiterEmailFallbackEnabled({}), false);
  assert.equal(recruiterEmailFallbackEnabled({ RECRUITER_EMAIL_FALLBACK_ENABLED: "on" }), true);
  assert.equal(genericCompanyContactReason("info@acme.com", false), "generic_company_contact");
  assert.equal(genericCompanyContactReason("contact@acme.com", false), "generic_company_contact");
  assert.equal(genericCompanyContactReason("hello@acme.com", false), "generic_company_contact");
  assert.equal(genericCompanyContactReason("support@acme.com", false), "generic_company_contact");
  assert.equal(genericCompanyContactReason("privacy@acme.com", false), "generic_company_contact");
  assert.equal(genericCompanyContactReason("press@acme.com", false), "generic_company_contact");
  assert.equal(genericCompanyContactReason("sales@acme.com", false), "generic_company_contact");
  assert.equal(genericCompanyContactReason("admin@acme.com", false), "generic_company_contact");
  assert.equal(genericCompanyContactReason("noreply@acme.com", false), "generic_company_contact");
  assert.equal(genericCompanyContactReason("careers@acme.com", false), "generic_careers_inbox");
  assert.equal(genericCompanyContactReason("jobs@acme.com", false), "generic_careers_inbox");
  assert.equal(genericCompanyContactReason("careers@acme.com", true), null);
  assert.equal(genericCompanyContactReason("jobs@acme.com", true), null);
  assert.equal(genericCompanyContactReason("talent@acme.com", false), null);
  assert.equal(postingNamesApplyAddress("Send your CV to careers@acme.com for this role.", "careers@acme.com"), true);
  const jobSpecific = postingSpecificRecruiterDecision({
    email: "hiring-this-role@acme.com",
    provenance: { sourceType: "job_description", extraction: "job_description" } as never,
  }, { description: "Apply by email to hiring-this-role@acme.com" });
  assert.deepEqual(jobSpecific, { ok: true });
  const genericPage = postingSpecificRecruiterDecision({
    email: "talent@acme.com",
    provenance: { sourceType: "employer_domain_page", extraction: "visible_application_instruction" } as never,
  }, { description: "Apply on the site." });
  assert.deepEqual(genericPage, { ok: false, reason: "not_job_specific_inbox" });
  const info = postingSpecificRecruiterDecision({
    email: "info@acme.com",
    provenance: { sourceType: "job_description", extraction: "job_description" } as never,
  }, { description: "Contact info@acme.com" });
  assert.deepEqual(info, { ok: false, reason: "generic_company_contact" });
}

async function testEnabledJobSpecificQueue() {
  process.env.RECRUITER_EMAIL_FALLBACK_ENABLED = "on";
  const now = new Date("2026-10-24T12:00:00.000Z");
  const updates: Array<Record<string, unknown>> = [];
  const enqueued: string[] = [];
  const db = {
    application: {
      findMany: async () => [{
        id: "job-specific",
        submitStartedAt: null, submittedAt: null, submittedVia: null, submitConfirmation: null,
        canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
        job: {
          id: "job-ashby", url: "https://jobs.ashbyhq.com/acme/uuid", company: "Acme",
          description: "Send your CV to hiring@acme.com for this role.",
          recruiterEmail: null, recruiterEmailSourceUrl: null, companyWebsite: "https://www.acme.com",
        },
      }],
      updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, ...data });
        return { count: 1 };
      },
    },
    job: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push({ job: true, ...data });
        return data;
      },
    },
  };
  const queued = await recheckSkippedAtsHandoffs({
    now, db, limit: 8,
    lookup: async () => ({
      email: "hiring@acme.com",
      provenance: {
        version: 1, sourceType: "job_description", requestedUrl: "https://jobs.ashbyhq.com/acme/uuid",
        sourceUrl: "https://jobs.ashbyhq.com/acme/uuid", observedAt: now.toISOString(), pageSha256: "x",
        evidence: "Send your CV to hiring@acme.com", company: "Acme", extraction: "job_description",
      },
    }),
    enqueue: async (id) => { enqueued.push(id); },
  });
  assert.equal(queued.found, 1);
  assert.equal(queued.queued, 1);
  assert.equal(queued.rejected, 0);
  assert.deepEqual(enqueued, ["job-specific"]);
  delete process.env.RECRUITER_EMAIL_FALLBACK_ENABLED;
}

function testSourceFences() {
  const worker = readFileSync("src/lib/application-worker.ts", "utf8");
  assert.match(worker, /lookupPublishedSkipListInbox/);
  assert.ok(worker.indexOf("lookupPublishedSkipListInbox") < worker.indexOf("reserveApplicationWork(applicationId,"));
  assert.match(readFileSync("src/lib/auto-apply-cron.ts", "utf8"), /admitAutoApplyApplication/);
  assert.match(readFileSync("src/lib/cron-self-heal.ts", "utf8"), /recheckSkippedAtsHandoffs/);
  assert.doesNotMatch(readFileSync("src/lib/cron-self-heal.ts", "utf8"), /prisma\.application\.update/);
  assert.match(readFileSync("prisma/migrations/20261024190000_recruiter_email_recheck/migration.sql", "utf8"), /ADD COLUMN IF NOT EXISTS "recruiterEmailRecheckedAt"/);
}

async function main() {
  await testPublishedWebsites();
  await testCheapLookup();
  await testOneTimeRecheck();
  testRecruiterEmailFallbackPolicy();
  await testEnabledJobSpecificQueue();
  testSourceFences();
  console.log("PASS skip-list inbox followup: JSON websites, cheap lookup, one-time recheck records without queue, job-specific only when enabled.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
