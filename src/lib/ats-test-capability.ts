/**
 * Restricted ATS test capability. Reuses the production adapter, worker,
 * status and evidence pipeline. Never a parallel submit path.
 *
 * Server-side only:
 *   ATS_TEST_USER_ID            dedicated test user id
 *   ATS_TEST_DESTINATIONS       comma/space list of host/o/slug
 *                               e.g. produzioneweb.recruitee.com/o/trial-offer
 *   ATS_TEST_CANDIDATE_EMAIL    owned mailbox outside LavorAI inbound domains
 *   ATS_TEST_REAL_SUBMIT        must be exactly "true" for a real submit
 *
 * Test jobs use source `ats_test` and are excluded from feeds, matching,
 * other users and quota. Do not add the tenant to RECRUITEE_COMPANIES.
 *
 * Pause exemption is a module-private branded token. Only
 * POST /api/admin/ats-test-apply → prepareAndRunAtsTest may mint it and
 * pass it into processApplication. Cron, drain, claim, auto-apply,
 * recruiter-delivery and sendWithinQuota cannot construct or inherit it.
 */

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { asIssuedWorkLease, issueApplicationLease, type ApplicationWorkLease } from "@/lib/application-lease";
import { DEFAULT_USER_INBOX_DOMAIN } from "@/lib/inbound/address";
import type { CVProfile } from "@/lib/cv-profile-types";

export const ATS_TEST_JOB_SOURCE = "ats_test";
export const ATS_TEST_FICTIONAL_MARK = "[LavorAI TEST · FICTIONAL]";
/** Placeholder in the in-memory profile. Must never be the submitted address. */
export const ATS_TEST_PLACEHOLDER_EMAIL = "ats-test@example.invalid";
export const ATS_TEST_REFUSED_BEFORE_SUBMIT = "REFUSED_BEFORE_SUBMIT";
/**
 * In-flight marker written by claimAtsTestAttempt. String column — no migration.
 *
 * State machine (one diagnostic row per destination; dry and real are two offers):
 *   queued + null                  → fresh, claimable
 *   ready_to_apply + REFUSED_BEFORE_SUBMIT + no submitStartedAt
 *                                  → pre-POST refusal, claimable retry
 *   optimizing + ATS_TEST_CLAIMED + lease
 *                                  → claimed; only count===1 proceeds to the sender
 *                                    crash here is non-retryable (ats_test_in_progress)
 *   ready_to_apply + DRY_RUN       → dry finished; dest consumed (real uses the other offer)
 *   ready_to_apply + REFUSED_…     → adapter refused again; retryable
 *   applying/ready_to_apply + SUBMISSION_STARTED / UNCONFIRMED / submitStartedAt
 *                                  → uncertain after a send claim; non-retryable
 *   success + DETECTED_*           → sent; dest consumed
 */
export const ATS_TEST_CLAIMED = "ATS_TEST_CLAIMED";
export const ATS_TEST_IN_PROGRESS = "ats_test_in_progress";

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i;
const HARDCODED_INBOUND_DOMAINS = ["inbound.lavorai.it", "apply.lavorai.it"] as const;

export type AtsTestEnv = Record<string, string | undefined>;

export type AtsTestDestination = {
  host: string;
  slug: string;
  url: string;
};

const DEST_RE = /^(?:https:\/\/)?([^/\s?#]+)\/o\/([^/?#\s]+)/i;

/** Module-private brand. Ordinary object literals cannot satisfy it. */
const ATS_TEST_AUTH_BRAND = Symbol("lavorai.atsTestAuthorization");

export type AtsTestAuthorization = {
  readonly [ATS_TEST_AUTH_BRAND]: typeof ATS_TEST_AUTH_BRAND;
  readonly userId: string;
  readonly destination: AtsTestDestination;
  readonly applicationId: string;
  readonly mode: "dry_run" | "real_submit";
  readonly realSubmitRequested: boolean;
};

export function isAtsTestAuthorization(value: unknown): value is AtsTestAuthorization {
  return !!value
    && typeof value === "object"
    && (value as { [ATS_TEST_AUTH_BRAND]?: unknown })[ATS_TEST_AUTH_BRAND] === ATS_TEST_AUTH_BRAND;
}

function mintAtsTestAuthorization(input: {
  userId: string;
  destination: AtsTestDestination;
  applicationId: string;
  mode: "dry_run" | "real_submit";
  realSubmitRequested: boolean;
}): AtsTestAuthorization {
  return {
    [ATS_TEST_AUTH_BRAND]: ATS_TEST_AUTH_BRAND,
    userId: input.userId,
    destination: input.destination,
    applicationId: input.applicationId,
    mode: input.mode,
    realSubmitRequested: input.realSubmitRequested,
  };
}

export function atsTestUserId(env: AtsTestEnv = process.env): string | null {
  const id = env.ATS_TEST_USER_ID?.trim();
  return id || null;
}

export function isAtsTestUser(userId: string | null | undefined, env: AtsTestEnv = process.env): boolean {
  const expected = atsTestUserId(env);
  return !!expected && !!userId && userId === expected;
}

export function isAtsTestJobSource(source: string | null | undefined): boolean {
  return source === ATS_TEST_JOB_SOURCE;
}

export function excludeAtsTestJobsWhere() {
  return { source: { not: ATS_TEST_JOB_SOURCE } } as const;
}

export function excludeAtsTestJobRelationWhere() {
  return { job: { source: { not: ATS_TEST_JOB_SOURCE } } } as const;
}

/** Real submit requires the env value to be exactly "true" (after trim). */
export function atsTestRealSubmitEnabled(env: AtsTestEnv = process.env): boolean {
  return env.ATS_TEST_REAL_SUBMIT?.trim() === "true";
}

export function lavoraiInboundDomains(env: AtsTestEnv = process.env): string[] {
  const domains = new Set<string>(HARDCODED_INBOUND_DOMAINS);
  const inbound = env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase();
  const user = (env.INBOUND_USER_DOMAIN?.trim() || DEFAULT_USER_INBOX_DOMAIN).toLowerCase();
  if (inbound) domains.add(inbound);
  if (user) domains.add(user);
  return [...domains];
}

function emailDomainIsInbound(domain: string, inboundDomains: string[]): boolean {
  const d = domain.toLowerCase();
  return inboundDomains.some((inbound) => d === inbound || d.endsWith(`.${inbound}`));
}

export type AtsTestCandidateEmail =
  | { ok: true; email: string }
  | { ok: false; reason: string };

export function atsTestCandidateEmail(env: AtsTestEnv = process.env): AtsTestCandidateEmail {
  const raw = env.ATS_TEST_CANDIDATE_EMAIL?.trim() ?? "";
  if (!raw) return { ok: false, reason: "ats_test_candidate_email_unconfigured" };
  if (raw.toLowerCase() === ATS_TEST_PLACEHOLDER_EMAIL) {
    return { ok: false, reason: "ats_test_candidate_email_placeholder" };
  }
  const match = raw.match(EMAIL_RE);
  if (!match) return { ok: false, reason: "ats_test_candidate_email_invalid" };
  if (emailDomainIsInbound(match[1], lavoraiInboundDomains(env))) {
    return { ok: false, reason: "ats_test_candidate_email_inbound_domain" };
  }
  return { ok: true, email: raw };
}

export function maskAtsTestCandidateEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***@${email.slice(at + 1)}`;
}

export function atsTestCandidateEmailState(env: AtsTestEnv = process.env): {
  configured: boolean;
  masked: string | null;
  reason: string | null;
} {
  const result = atsTestCandidateEmail(env);
  if (!result.ok) return { configured: false, masked: null, reason: result.reason };
  return { configured: true, masked: maskAtsTestCandidateEmail(result.email), reason: null };
}

export function atsTestSkipsDocumentTailoring(auth: unknown): boolean {
  return isAtsTestAuthorization(auth);
}

export function atsTestSkipsRecruiterLookup(auth: unknown): boolean {
  return isAtsTestAuthorization(auth);
}

function parseDestinationToken(value: string): AtsTestDestination | null {
  const match = value.trim().match(DEST_RE);
  if (!match) return null;
  const host = match[1].toLowerCase();
  let slug = match[2];
  try { slug = decodeURIComponent(slug); } catch { /* keep raw */ }
  if (!host || !slug || host.includes("..")) return null;
  return { host, slug, url: `https://${host}/o/${slug}` };
}

export function parseAtsTestDestinations(env: AtsTestEnv = process.env): AtsTestDestination[] {
  const raw = env.ATS_TEST_DESTINATIONS?.trim() ?? "";
  if (!raw) return [];
  const seen = new Set<string>();
  const out: AtsTestDestination[] = [];
  for (const token of raw.split(/[\s,]+/)) {
    const dest = parseDestinationToken(token);
    if (!dest) continue;
    const key = `${dest.host}/o/${dest.slug.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(dest);
  }
  return out;
}

export function matchAtsTestDestination(url: string, env: AtsTestEnv = process.env): AtsTestDestination | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== "https:") return null;
  const dest = parseDestinationToken(`${parsed.hostname}${parsed.pathname}`);
  if (!dest) return null;
  return parseAtsTestDestinations(env).find((allowed) =>
    allowed.host === dest.host && allowed.slug.toLowerCase() === dest.slug.toLowerCase(),
  ) ?? null;
}

/** Recruitee adapter/liveness may accept a non-published offer only here. */
export function allowUnpublishedRecruiteeOffer(url: string, env: AtsTestEnv = process.env): boolean {
  return matchAtsTestDestination(url, env) !== null;
}

export type AtsTestAuthInput = {
  adminOk: boolean;
  jobUrl?: string | null;
  jobSource?: string | null;
  targetUserId?: string | null;
  realSubmit?: boolean;
};

export type AtsTestAuthOk = {
  ok: true;
  mode: "dry_run" | "real_submit";
  userId: string;
  destination: AtsTestDestination;
};

export type AtsTestAuthDenied = { ok: false; reason: string };

export function authorizeAtsTest(input: AtsTestAuthInput, env: AtsTestEnv = process.env): AtsTestAuthOk | AtsTestAuthDenied {
  if (!input.adminOk) return { ok: false, reason: "forbidden" };
  const userId = atsTestUserId(env);
  if (!userId) return { ok: false, reason: "ats_test_user_unconfigured" };
  if (input.targetUserId && input.targetUserId !== userId) return { ok: false, reason: "ats_test_user_mismatch" };
  const destinations = parseAtsTestDestinations(env);
  if (!destinations.length) return { ok: false, reason: "ats_test_destinations_unconfigured" };
  const destination = input.jobUrl?.trim()
    ? matchAtsTestDestination(input.jobUrl, env)
    : destinations[0];
  if (!destination) return { ok: false, reason: "ats_test_destination_not_allowlisted" };
  if (input.jobSource && !isAtsTestJobSource(input.jobSource)) {
    return { ok: false, reason: "ats_test_job_source_required" };
  }
  const candidate = atsTestCandidateEmail(env);
  if (!candidate.ok) return { ok: false, reason: candidate.reason };
  if (input.realSubmit) {
    if (!atsTestRealSubmitEnabled(env)) return { ok: false, reason: "ats_test_real_submit_disabled" };
    return { ok: true, mode: "real_submit", userId, destination };
  }
  return { ok: true, mode: "dry_run", userId, destination };
}

export function atsTestJobExternalId(destination: AtsTestDestination): string {
  return `${destination.host}/o/${destination.slug}`;
}

/** One application row per normalized destination. Dry and real need two offers. */
export function atsTestApplicationId(destination: AtsTestDestination): string {
  const hex = createHash("sha256").update(destination.url).digest("hex").slice(0, 24);
  return `ats_test_${hex}`;
}

export function atsTestDestinationLockKey(destination: AtsTestDestination): string {
  return `ats_test:${destination.host}/o/${destination.slug}`;
}

export function isAtsTestDiagnosticApplication(applicationId: string, destination: AtsTestDestination): boolean {
  return applicationId === atsTestApplicationId(destination);
}

export type AtsTestRecheckInput = {
  ownerUserId: string;
  destinationUrl: string;
  applicationId: string;
  jobSource?: string | null;
  realSubmit: boolean;
  /** Outgoing multipart `candidate[email]` immediately before POST. */
  multipartEmail?: string;
};

export type AtsTestRecheckResult = { ok: true } | { ok: false; reason: string };

/**
 * Re-validate the branded token plus the four submit checks.
 * Call immediately before the adapter's submit HTTP POST.
 */
export function recheckAtsTestBeforeSubmitHttp(
  auth: unknown,
  input: AtsTestRecheckInput,
  env: AtsTestEnv = process.env,
): AtsTestRecheckResult {
  const isTestJob = isAtsTestJobSource(input.jobSource) || isAtsTestAuthorization(auth);
  if (!isTestJob) return { ok: true };
  if (!isAtsTestAuthorization(auth)) return { ok: false, reason: "ats_test_authorization_required" };

  if (!isAtsTestUser(input.ownerUserId, env) || auth.userId !== input.ownerUserId) {
    return { ok: false, reason: "ats_test_user_mismatch" };
  }

  const destination = matchAtsTestDestination(input.destinationUrl, env);
  if (!destination || destination.url !== auth.destination.url) {
    return { ok: false, reason: "ats_test_destination_not_allowlisted" };
  }

  if (
    !isAtsTestDiagnosticApplication(input.applicationId, destination)
    || auth.applicationId !== input.applicationId
    || (input.jobSource != null && !isAtsTestJobSource(input.jobSource))
  ) {
    return { ok: false, reason: "ats_test_application_not_diagnostic" };
  }

  if (input.realSubmit) {
    if (!atsTestRealSubmitEnabled(env) || auth.realSubmitRequested !== true || auth.mode !== "real_submit") {
      return { ok: false, reason: "ats_test_real_submit_disabled" };
    }
  } else if (auth.mode !== "dry_run") {
    return { ok: false, reason: "ats_test_mode_mismatch" };
  }

  const candidate = atsTestCandidateEmail(env);
  if (!candidate.ok) return { ok: false, reason: candidate.reason };
  if (input.multipartEmail !== undefined && input.multipartEmail !== candidate.email) {
    return { ok: false, reason: "ats_test_candidate_email_mismatch" };
  }

  return { ok: true };
}

/** Pause exemption only: branded token bound to this application id. */
export function atsTestPauseExemption(
  auth: unknown,
  row: { id: string; userId: string; job: { url: string } },
  env: AtsTestEnv = process.env,
): boolean {
  if (!isAtsTestAuthorization(auth)) return false;
  const destination = matchAtsTestDestination(row.job.url, env);
  return !!destination
    && auth.applicationId === row.id
    && auth.userId === row.userId
    && isAtsTestUser(row.userId, env)
    && isAtsTestDiagnosticApplication(row.id, destination)
    && auth.destination.url === destination.url;
}

export function atsTestPauseExemptionForId(
  auth: unknown,
  applicationId: string,
  env: AtsTestEnv = process.env,
): boolean {
  if (!isAtsTestAuthorization(auth)) return false;
  return auth.applicationId === applicationId
    && isAtsTestUser(auth.userId, env)
    && !!matchAtsTestDestination(auth.destination.url, env)
    && isAtsTestDiagnosticApplication(applicationId, auth.destination);
}

export function syntheticAtsTestProfile(): CVProfile {
  return {
    firstName: "LavorAI",
    lastName: "Test",
    email: ATS_TEST_PLACEHOLDER_EMAIL,
    phone: "",
    city: "Test City",
    title: `${ATS_TEST_FICTIONAL_MARK} Diagnostic candidate`,
    summary: `${ATS_TEST_FICTIONAL_MARK} Synthetic profile. Not a real person. Used only on the restricted ATS test path.`,
    experiences: [{
      role: "Diagnostic stand-in",
      company: "LavorAI Test",
      location: "Test City",
      startDate: "2024-01",
      endDate: "Present",
      description: `${ATS_TEST_FICTIONAL_MARK} Fictional experience.`,
      bullets: [`${ATS_TEST_FICTIONAL_MARK} No real employer.`],
    }],
    education: [],
    skills: [{ name: "ATS test" }],
    languages: [{ name: "Italian", level: "Native" }],
    links: [],
  };
}

export function syntheticAtsTestCvText(): string {
  const profile = syntheticAtsTestProfile();
  return [
    ATS_TEST_FICTIONAL_MARK,
    `${profile.firstName} ${profile.lastName}`,
    profile.title,
    profile.summary,
    profile.experiences.map((item) => `${item.role} @ ${item.company}: ${item.description}`).join("\n"),
  ].join("\n");
}

export type AtsTestPriorRow = {
  id: string;
  userId: string;
  status?: string | null;
  submitStartedAt?: Date | null;
  submittedAt?: Date | null;
  submittedVia?: string | null;
  submitConfirmation?: string | null;
  canaryLog?: string | null;
  answersUsedJson?: string | null;
  viewedAt?: Date | null;
  lastReplyAt?: Date | null;
  replyCount?: number | null;
  userStatus?: string | null;
};

const NO_SEND_CONFIRMATIONS = new Set(["NOT_SUBMITTED", "NEEDS_ANSWERS", "DRY_RUN", "JOB_CLOSED"]);

/** Same refuse rules as uncertain-submission, inlined so adapters stay a leaf. */
export function atsTestUncertainReason(row: AtsTestPriorRow): string | null {
  if (row.submitStartedAt) return "uncertain_submit_started";
  if (row.submitConfirmation === "UNCONFIRMED" || row.submitConfirmation === "SUBMISSION_STARTED") {
    return "uncertain_submission";
  }
  if (NO_SEND_CONFIRMATIONS.has(row.submitConfirmation ?? "")) {
    if (row.submittedAt || row.submittedVia || row.viewedAt || row.lastReplyAt || row.replyCount || row.userStatus) {
      return "uncertain_prior_attempt";
    }
    return null;
  }
  if (row.submittedAt || row.submittedVia || row.viewedAt || row.lastReplyAt || row.userStatus
    || row.submitConfirmation || row.canaryLog || row.answersUsedJson) {
    return "uncertain_prior_attempt";
  }
  return null;
}

export function atsTestPriorAttemptReason(rows: AtsTestPriorRow[], _mode: "dry_run" | "real_submit", env: AtsTestEnv = process.env): string | null {
  if (rows.some((row) => !isAtsTestUser(row.userId, env))) return "ats_test_other_user_application";
  let blocking = false;
  for (const row of rows) {
    if (row.submitConfirmation === ATS_TEST_CLAIMED) return ATS_TEST_IN_PROGRESS;
    if (row.submitConfirmation === ATS_TEST_REFUSED_BEFORE_SUBMIT) {
      if (row.submitStartedAt) return "uncertain_submit_started";
      if (row.submittedAt || row.submittedVia || row.viewedAt || row.lastReplyAt || row.replyCount || row.userStatus) {
        return "uncertain_prior_attempt";
      }
      continue;
    }
    const uncertain = atsTestUncertainReason(row);
    if (uncertain) return uncertain;
    blocking = true;
  }
  if (blocking) return "ats_test_already_attempted";
  return null;
}

/** Rows that may enter the sender. Predicate must change on a successful claim. */
export function atsTestClaimWhere(applicationId: string) {
  return {
    id: applicationId,
    submitStartedAt: null,
    submittedAt: null,
    submittedVia: null,
    OR: [
      { status: "queued", submitConfirmation: null },
      {
        status: { in: ["queued", "ready_to_apply"] },
        submitConfirmation: ATS_TEST_REFUSED_BEFORE_SUBMIT,
      },
    ],
  };
}

export type AtsTestClaimClient = Pick<PrismaClient, "application">;

/**
 * Single conditional transition to an in-flight state before any Recruitee
 * GET/POST. Proceed only when count===1. Held across the send via the lease.
 * Does not set submitStartedAt — that stays the actual send-boundary marker.
 */
export async function claimAtsTestAttempt(
  prisma: AtsTestClaimClient,
  applicationId: string,
): Promise<{ ok: true; lease: ApplicationWorkLease } | { ok: false; reason: string }> {
  const issued = issueApplicationLease();
  const claimed = await prisma.application.updateMany({
    where: atsTestClaimWhere(applicationId),
    data: {
      status: "optimizing",
      startedAt: issued.startedAt,
      leaseToken: issued.leaseToken,
      leaseExpiresAt: issued.leaseExpiresAt,
      submitConfirmation: ATS_TEST_CLAIMED,
      errorMessage: null,
      completedAt: null,
    },
  });
  if (claimed.count !== 1) return { ok: false, reason: ATS_TEST_IN_PROGRESS };
  return { ok: true, lease: asIssuedWorkLease(issued) };
}

export async function adoptAtsTestWorkLease(
  prisma: AtsTestClaimClient,
  applicationId: string,
  now = new Date(),
): Promise<ApplicationWorkLease | null> {
  const row = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      startedAt: true,
      leaseToken: true,
      leaseExpiresAt: true,
      submitConfirmation: true,
      status: true,
    },
  });
  if (!row?.startedAt || !row.leaseToken) return null;
  if (row.submitConfirmation !== ATS_TEST_CLAIMED) return null;
  if (!["queued", "optimizing", "ready_to_apply", "applying"].includes(row.status ?? "")) return null;
  if (row.leaseExpiresAt && +row.leaseExpiresAt <= +now) return null;
  return asIssuedWorkLease({ startedAt: row.startedAt, leaseToken: row.leaseToken });
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isUniqueConstraint(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002";
}

export type AtsTestJobRow = {
  id: string;
  source: string;
  url: string;
  externalId: string;
  title: string;
};

export type AtsTestAppResult = {
  id: string;
  status: string | null;
  submittedVia: string | null;
  submitConfirmation: string | null;
  submissionReceiptJson: string | null;
  errorMessage: string | null;
  submitStartedAt: Date | null;
};

export type AtsTestTx = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  application: {
    findUnique: (args: { where: { id: string } }) => Promise<AtsTestPriorRow | null>;
    findMany: (args: { where: { jobId: string } }) => Promise<AtsTestPriorRow[]>;
    create: (args: {
      data: {
        id: string;
        userId: string;
        jobId: string;
        portal: string;
        status: string;
        createdAt: Date;
        consentGrantedAt: Date;
        trackingToken: string;
      };
    }) => Promise<{ id: string }>;
  };
};

export type AtsTestDeps = {
  env?: AtsTestEnv;
  prisma: {
    $transaction: <T>(fn: (tx: AtsTestTx) => Promise<T>) => Promise<T>;
    user: { findUnique: (args: { where: { id: string } }) => Promise<{ id: string } | null> };
    job: {
      findFirst: (args: { where: { source?: string; url?: string } }) => Promise<AtsTestJobRow | null>;
      upsert: (args: {
        where: { externalId_source: { externalId: string; source: string } };
        update: { url: string; cachedAt: Date; closedAt: null };
        create: {
          externalId: string;
          source: string;
          title: string;
          company: string;
          location: string;
          description: string;
          url: string;
          sourceSlug: string | null;
        };
      }) => Promise<AtsTestJobRow>;
    };
    application: {
      findUnique: (args: { where: { id: string } }) => Promise<(AtsTestAppResult & AtsTestPriorRow) | null>;
      findMany: (args: { where: { jobId: string } }) => Promise<AtsTestPriorRow[]>;
      create: (args: {
        data: {
          id: string;
          userId: string;
          jobId: string;
          portal: string;
          status: string;
          createdAt: Date;
          consentGrantedAt: Date;
          trackingToken: string;
        };
      }) => Promise<{ id: string }>;
      updateMany: (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => Promise<{ count: number }>;
    };
  };
  processApplication: (id: string, opts: { atsTestAuth: AtsTestAuthorization }) => Promise<void>;
  findPortalAdapter: (url: string) => { id: string } | null;
};

export type AtsTestRunResult =
  | { ok: false; reason: string; status?: number }
  | {
      ok: true;
      mode: "dry_run" | "real_submit";
      applicationId: string;
      jobId: string;
      destination: AtsTestDestination;
      adapter: string;
      result: AtsTestAppResult | null;
    };

/**
 * Create one fresh ats_test application for the dedicated user and run it
 * through processApplication with a non-inheritable branded token.
 * Never enqueues. Never auto-retries. One row per destination.
 */
export async function prepareAndRunAtsTest(input: {
  adminOk: boolean;
  realSubmit?: boolean;
  jobUrl?: string | null;
}, deps: AtsTestDeps): Promise<AtsTestRunResult> {
  const env = deps.env ?? process.env;
  const auth = authorizeAtsTest({
    adminOk: input.adminOk,
    realSubmit: input.realSubmit === true,
    jobUrl: input.jobUrl,
  }, env);
  if (!auth.ok) return { ok: false, reason: auth.reason, status: auth.reason === "forbidden" ? 403 : 400 };

  const user = await deps.prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) return { ok: false, reason: "ats_test_user_missing", status: 409 };

  const adapter = deps.findPortalAdapter(auth.destination.url);
  if (!adapter) return { ok: false, reason: "ats_test_adapter_missing", status: 409 };

  const externalId = atsTestJobExternalId(auth.destination);
  const job = await deps.prisma.job.upsert({
    where: { externalId_source: { externalId, source: ATS_TEST_JOB_SOURCE } },
    update: { url: auth.destination.url, cachedAt: new Date(), closedAt: null },
    create: {
      externalId,
      source: ATS_TEST_JOB_SOURCE,
      title: auth.destination.slug,
      company: auth.destination.host.split(".")[0] ?? auth.destination.host,
      location: "ATS test",
      description: "Restricted ATS test destination. Excluded from feeds, matching, other users and quota.",
      url: auth.destination.url,
      sourceSlug: auth.destination.host.split(".")[0] ?? null,
    },
  });
  if (!isAtsTestJobSource(job.source) || !matchAtsTestDestination(job.url, env)) {
    return { ok: false, reason: "ats_test_job_source_required", status: 409 };
  }

  const applicationId = atsTestApplicationId(auth.destination);
  const existingById = await deps.prisma.application.findUnique({ where: { id: applicationId } });
  if (existingById) {
    const existingReason = atsTestPriorAttemptReason([existingById], auth.mode, env);
    if (existingReason) return { ok: false, reason: existingReason, status: 409 };
  }
  const existing = await deps.prisma.application.findMany({ where: { jobId: job.id } });
  const prior = atsTestPriorAttemptReason(existing, auth.mode, env);
  if (prior) return { ok: false, reason: prior, status: 409 };

  const createdAt = new Date();
  const lockKey = atsTestDestinationLockKey(auth.destination);
  let created: { id: string };
  try {
    created = await deps.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const locked = await tx.application.findUnique({ where: { id: applicationId } });
      if (locked) {
        const lockedReason = atsTestPriorAttemptReason([locked], auth.mode, env);
        if (lockedReason) {
          throw Object.assign(new Error(lockedReason), { code: "P2002" });
        }
        return { id: locked.id };
      }
      const siblings = await tx.application.findMany({ where: { jobId: job.id } });
      const siblingReason = atsTestPriorAttemptReason(siblings, auth.mode, env);
      if (siblingReason) {
        throw Object.assign(new Error(siblingReason), { code: "P2002" });
      }
      return tx.application.create({
        data: {
          id: applicationId,
          userId: auth.userId,
          jobId: job.id,
          portal: adapter.id,
          status: "queued",
          createdAt,
          consentGrantedAt: createdAt,
          trackingToken: randomToken(),
        },
      });
    });
  } catch (error) {
    if (isUniqueConstraint(error) || (error instanceof Error && /ats_test_already_attempted|uncertain_/.test(error.message))) {
      const again = await deps.prisma.application.findUnique({ where: { id: applicationId } });
      const reason = again
        ? (atsTestPriorAttemptReason([again], auth.mode, env) ?? "ats_test_already_attempted")
        : "ats_test_already_attempted";
      return { ok: false, reason, status: 409 };
    }
    throw error;
  }

  const claimed = await claimAtsTestAttempt(deps.prisma as unknown as AtsTestClaimClient, created.id);
  if (!claimed.ok) return { ok: false, reason: claimed.reason, status: 409 };

  const token = mintAtsTestAuthorization({
    userId: auth.userId,
    destination: auth.destination,
    applicationId: created.id,
    mode: auth.mode,
    realSubmitRequested: input.realSubmit === true,
  });

  try {
    await deps.processApplication(created.id, { atsTestAuth: token });
  } catch (err) {
    await deps.prisma.application.updateMany({
      where: { id: created.id, status: "queued" },
      data: {
        status: "ready_to_apply",
        errorMessage: err instanceof Error ? err.message : "ATS test run failed before admission.",
      },
    });
    return { ok: false, reason: "ats_test_process_failed", status: 500 };
  }

  // Never leave a queued row for the poller: it would call processApplication
  // without the branded token.
  await deps.prisma.application.updateMany({
    where: { id: created.id, status: "queued" },
    data: {
      status: "ready_to_apply",
      errorMessage: "ATS test non ammesso dalla pipeline di produzione. Nessun invio eseguito; la riga non resta in coda.",
    },
  });

  const result = await deps.prisma.application.findUnique({ where: { id: created.id } });
  return {
    ok: true,
    mode: auth.mode,
    applicationId: created.id,
    jobId: job.id,
    destination: auth.destination,
    adapter: adapter.id,
    result,
  };
}
