import type { CreateEmailOptions } from "resend";
import { prisma } from "@/lib/db";
import {
  isDedicatedTestDestination,
  normalizeCanaryAddress,
  RELEASE_CANARY,
} from "@/lib/release-email-canary";
type RecruiterDeliveryResult =
  | { kind: "accepted"; attemptId: string; providerEmailId: string }
  | { kind: "not_sent"; reason: string }
  | { kind: "uncertain"; attemptId: string | null };

/** New diagnostic fixture. Never the 14/10 canary application or attempt key. */
export const EMAIL_TEST = Object.freeze({
  jobId: "email_test_job_20261025",
  applicationId: "email_test_diagnostic_20261025",
  portal: "email_test",
  submitConfirmation: "EMAIL_TEST_DIAGNOSTIC",
  from: "LavorAI <noreply@lavorai.it>",
  replyTo: RELEASE_CANARY.replyTo,
  title: "[LavorAI TEST] Controlled email delivery check",
  company: "LavorAI Diagnostic (fictional)",
  description: "Owner-approved diagnostic with fictional applicant data only. This is not a job vacancy or an application to an employer.",
  url: "https://example.invalid/lavorai-email-test-20261025",
  subjectPrefix: "[LavorAI TEST · FICTIONAL] Email delivery check",
  text: "LavorAI controlled email test. THIS IS A TEST, NOT A REAL JOB APPLICATION.\n\nFictional applicant: Alex Example.\nFictional role: Test Engineer at Example Company (fictional).\nFictional experience: Creating synthetic test cases. No customer CV or personal candidate data is included.\n\nThis single email tests persisted send, provider acceptance, delivery events and inbound routing.\nCustomer applications remain paused. This diagnostic does not count as employer interest or an application outcome.",
});

export const LEGACY_CANARY_ATTEMPT_KEY = RELEASE_CANARY.attemptKey;

export type EmailTestRefuseReason =
  | "email_test_unauthorized"
  | "email_test_user_missing"
  | "email_test_destination_refused"
  | "email_test_ordinary_application"
  | "email_test_legacy_key_forbidden"
  | "email_test_legacy_fixture_forbidden"
  | "email_test_run_key_invalid"
  | "email_test_duplicate_key"
  | "email_test_user_mismatch"
  | "email_test_fixture_mismatch"
  | "email_test_application_not_found"
  | "email_test_refused";

export type EmailTestEvidenceLevel =
  | "not_sent"
  | "pending"
  | "provider_accepted"
  | "provider_delivered"
  | "inbound_received"
  | "provider_bounced"
  | "provider_complained"
  | "provider_failed";

export type EmailTestRequest = {
  applicationId: string;
  attemptKey: string;
  runKey: string;
  recipient: string;
  recipientProvenanceJson: string;
  payload: CreateEmailOptions;
};

export function emailTestUserId(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = (env.EMAIL_TEST_USER_ID ?? env.ATS_TEST_USER_ID ?? "").trim();
  return id || null;
}

/** Admin key only. An admin session is not enough. */
export function adminEmailTestAuthorized(
  input: { headerKey: string | null },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = (env.ADMIN_SYNC_KEY ?? "").trim();
  const header = (input.headerKey ?? "").trim();
  return Boolean(expected && header && header === expected);
}

export function parseEmailTestRunKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(key)) return null;
  return key;
}

export function parseEmailTestDestination(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const destination = normalizeCanaryAddress(raw);
  return isDedicatedTestDestination(destination) ? destination : null;
}

export function emailTestAttemptKey(runKey: string, destination: string): string {
  return `email-test/${runKey}/${normalizeCanaryAddress(destination)}`;
}

export function emailTestPayload(destination: string): CreateEmailOptions {
  const to = normalizeCanaryAddress(destination);
  return {
    from: EMAIL_TEST.from,
    to,
    replyTo: EMAIL_TEST.replyTo,
    subject: `${EMAIL_TEST.subjectPrefix} · ${to}`,
    text: EMAIL_TEST.text,
  };
}

export function emailTestProvenance(applicationId: string, runKey: string, destination: string): string {
  return JSON.stringify({
    kind: "owner_approved_fictional_email_test",
    date: "2026-10-25",
    applicationId,
    runKey,
    destination: normalizeCanaryAddress(destination),
    employerProvenance: false,
  });
}

function exactPayload(expected: CreateEmailOptions, actual: CreateEmailOptions): boolean {
  const exp = expected as unknown as Record<string, unknown>;
  const act = actual as unknown as Record<string, unknown>;
  return Object.keys(act).length === Object.keys(exp).length
    && Object.keys(exp).every((key) => Object.hasOwn(act, key) && act[key] === exp[key]);
}

const FIXTURE_SELECT = {
  id: true, userId: true, jobId: true, portal: true, status: true, sessionId: true,
  cvDocxPath: true, cvPdfPath: true, coverLetterPath: true, coverLetterText: true, consentGrantedAt: true,
  startedAt: true, submittedAt: true, submittedVia: true, submitConfirmation: true,
  user: { select: { id: true } },
  job: { select: { id: true, source: true, externalId: true, title: true, company: true, description: true, url: true, closedAt: true } },
} as const;

function fixtureMatches(
  app: {
    userId: string; jobId: string; portal: string; status: string; sessionId: string | null;
    cvDocxPath: string | null; cvPdfPath: string | null; coverLetterPath: string | null;
    coverLetterText: string | null; consentGrantedAt: Date | null; startedAt: Date | null;
    submittedAt: Date | null; submittedVia: string | null; submitConfirmation: string | null;
    user: { id: string };
    job: { id: string; source: string; closedAt: Date | null };
  },
  userId: string,
): boolean {
  return app.userId === userId && app.user.id === userId
    && app.portal === EMAIL_TEST.portal && app.status === "diagnostic"
    && app.submitConfirmation === EMAIL_TEST.submitConfirmation
    && app.job.source === "email_test" && app.job.id === app.jobId && app.job.closedAt !== null
    && [app.sessionId, app.cvDocxPath, app.cvPdfPath, app.coverLetterPath, app.coverLetterText,
      app.consentGrantedAt, app.startedAt, app.submittedAt, app.submittedVia].every((value) => value == null);
}

export async function authorizeEmailTest(
  input: EmailTestRequest,
  db: { application: { findUnique: typeof prisma.application.findUnique } } = prisma,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const userId = emailTestUserId(env);
  if (!userId) return false;
  if (input.attemptKey === LEGACY_CANARY_ATTEMPT_KEY) return false;
  if (input.applicationId === RELEASE_CANARY.applicationId || input.applicationId === RELEASE_CANARY.jobId) return false;
  if (!isDedicatedTestDestination(input.recipient)) return false;
  if (typeof input.payload.to === "string" && !isDedicatedTestDestination(input.payload.to)) return false;
  if (input.attemptKey !== emailTestAttemptKey(input.runKey, input.recipient)) return false;
  if (input.recipientProvenanceJson !== emailTestProvenance(input.applicationId, input.runKey, input.recipient)) return false;
  if (!exactPayload(emailTestPayload(input.recipient), input.payload)) return false;
  const app = await db.application.findUnique({ where: { id: input.applicationId }, select: FIXTURE_SELECT });
  return !!app && fixtureMatches(app, userId);
}

export type EmailTestDelivery = {
  evidenceLevel: EmailTestEvidenceLevel;
  label: string;
  employerConfirmed: false;
  providerEmailId: string | null;
  acceptedAt: string | null;
  attemptStatus: string | null;
  lastEventType: string | null;
  inboundId: string | null;
};

export function emailTestDeliveryFromRecords(input: {
  attempt?: {
    status: string;
    providerEmailId: string | null;
    acceptedAt: Date | string | null;
    lastEventType: string | null;
  } | null;
  inbound?: { id: string } | null;
}): EmailTestDelivery {
  const attempt = input.attempt ?? null;
  const inbound = input.inbound ?? null;
  const base = {
    employerConfirmed: false as const,
    providerEmailId: attempt?.providerEmailId ?? null,
    acceptedAt: attempt?.acceptedAt ? new Date(attempt.acceptedAt).toISOString() : null,
    attemptStatus: attempt?.status ?? null,
    lastEventType: attempt?.lastEventType ?? null,
    inboundId: inbound?.id ?? null,
  };
  if (attempt && ["complained"].includes(attempt.status)) {
    return { ...base, evidenceLevel: "provider_complained", label: "Email segnalata" };
  }
  if (attempt && attempt.status === "bounced") {
    return { ...base, evidenceLevel: "provider_bounced", label: "Email non consegnata" };
  }
  if (attempt && attempt.status === "failed") {
    return { ...base, evidenceLevel: "provider_failed", label: "Email non consegnata" };
  }
  if (attempt?.providerEmailId && attempt.status === "delivered") {
    return { ...base, evidenceLevel: "provider_delivered", label: "Email consegnata" };
  }
  if (inbound) {
    return { ...base, evidenceLevel: "inbound_received", label: "Email ricevuta in inbound" };
  }
  if (attempt?.providerEmailId && ["accepted", "delayed"].includes(attempt.status)) {
    return { ...base, evidenceLevel: "provider_accepted", label: "Email accettata" };
  }
  if (attempt) {
    return { ...base, evidenceLevel: "pending", label: "Test diagnostico" };
  }
  return { ...base, evidenceLevel: "not_sent", label: "Test diagnostico" };
}

export type EmailTestTables = Pick<
  typeof prisma,
  "user" | "job" | "application" | "emailTestAttempt" | "applicationEmailAttempt" | "inboundEmail"
>;

export type EmailTestDb = EmailTestTables & {
  $transaction: <T>(fn: (tx: EmailTestTables) => Promise<T>) => Promise<T>;
};

export type EmailTestSendFn = (input: {
  applicationId: string;
  attemptKey: string;
  recipient: string;
  recipientProvenanceJson: string;
  payload: CreateEmailOptions;
  emailTest: true;
  runKey: string;
}) => Promise<RecruiterDeliveryResult>;

export type PrepareEmailTestInput = {
  destination?: unknown;
  runKey?: unknown;
  applicationId?: unknown;
};

export type PrepareEmailTestResult =
  | { ok: true; applicationId: string; runKey: string; destination: string; attemptKey: string; result: RecruiterDeliveryResult; delivery: EmailTestDelivery }
  | { ok: false; reason: EmailTestRefuseReason };

async function readDelivery(db: EmailTestTables, applicationId: string, attemptKey: string, destination: string): Promise<EmailTestDelivery> {
  const [attempt, inbound] = await Promise.all([
    db.applicationEmailAttempt.findUnique({
      where: { attemptKey },
      select: { status: true, providerEmailId: true, acceptedAt: true, lastEventType: true },
    }),
    db.inboundEmail.findFirst({
      where: { applicationId, toAddress: destination },
      orderBy: { receivedAt: "desc" },
      select: { id: true },
    }),
  ]);
  return emailTestDeliveryFromRecords({ attempt, inbound });
}

async function ensureFixture(tx: EmailTestTables, userId: string, requestedId: string | null): Promise<{ ok: true; applicationId: string } | { ok: false; reason: EmailTestRefuseReason }> {
  if (requestedId === RELEASE_CANARY.applicationId || requestedId === RELEASE_CANARY.jobId) {
    return { ok: false, reason: "email_test_legacy_fixture_forbidden" };
  }
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return { ok: false, reason: "email_test_user_missing" };

  if (requestedId && requestedId !== EMAIL_TEST.applicationId) {
    const existing = await tx.application.findUnique({ where: { id: requestedId }, select: FIXTURE_SELECT });
    if (!existing) return { ok: false, reason: "email_test_application_not_found" };
    if (existing.userId !== userId) return { ok: false, reason: "email_test_user_mismatch" };
    if (!fixtureMatches(existing, userId)) return { ok: false, reason: "email_test_ordinary_application" };
    return { ok: true, applicationId: existing.id };
  }

  const applicationId = EMAIL_TEST.applicationId;
  const existing = await tx.application.findUnique({ where: { id: applicationId }, select: FIXTURE_SELECT });
  if (existing) {
    if (!fixtureMatches(existing, userId)) return { ok: false, reason: "email_test_fixture_mismatch" };
    return { ok: true, applicationId };
  }

  const job = await tx.job.findUnique({ where: { id: EMAIL_TEST.jobId }, select: { id: true, source: true } });
  if (job && job.source !== "email_test") return { ok: false, reason: "email_test_fixture_mismatch" };
  if (!job) {
    await tx.job.create({
      data: {
        id: EMAIL_TEST.jobId,
        externalId: EMAIL_TEST.jobId,
        source: "email_test",
        title: EMAIL_TEST.title,
        company: EMAIL_TEST.company,
        description: EMAIL_TEST.description,
        url: EMAIL_TEST.url,
        closedAt: new Date(),
      },
    });
  }
  await tx.application.create({
    data: {
      id: applicationId,
      userId,
      jobId: EMAIL_TEST.jobId,
      portal: EMAIL_TEST.portal,
      status: "diagnostic",
      submitConfirmation: EMAIL_TEST.submitConfirmation,
    },
  });
  return { ok: true, applicationId };
}

export async function prepareAndRunEmailTest(
  input: PrepareEmailTestInput,
  deps: { prisma: EmailTestDb; send: EmailTestSendFn; env?: NodeJS.ProcessEnv },
): Promise<PrepareEmailTestResult> {
  const env = deps.env ?? process.env;
  const userId = emailTestUserId(env);
  if (!userId) return { ok: false, reason: "email_test_user_missing" };
  const destination = parseEmailTestDestination(input.destination);
  if (!destination) return { ok: false, reason: "email_test_destination_refused" };
  const runKey = parseEmailTestRunKey(input.runKey);
  if (!runKey) return { ok: false, reason: "email_test_run_key_invalid" };
  const requestedId = typeof input.applicationId === "string" && input.applicationId.trim()
    ? input.applicationId.trim()
    : null;

  const prepared = await deps.prisma.$transaction(async (tx) => {
    const fixture = await ensureFixture(tx, userId, requestedId);
    if (!fixture.ok) return fixture;
    const attemptKey = emailTestAttemptKey(runKey, destination);
    if (attemptKey === LEGACY_CANARY_ATTEMPT_KEY) return { ok: false as const, reason: "email_test_legacy_key_forbidden" as const };
    const existing = await tx.emailTestAttempt.findUnique({
      where: { runKey_destination: { runKey, destination } },
    });
    if (existing) return { ok: false as const, reason: "email_test_duplicate_key" as const };
    try {
      await tx.emailTestAttempt.create({
        data: { runKey, destination, attemptKey, applicationId: fixture.applicationId },
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "P2002") return { ok: false as const, reason: "email_test_duplicate_key" as const };
      throw error;
    }
    return { ok: true as const, applicationId: fixture.applicationId, attemptKey };
  });
  if (!prepared.ok) return prepared;

  const sendInput = {
    applicationId: prepared.applicationId,
    attemptKey: prepared.attemptKey,
    recipient: destination,
    recipientProvenanceJson: emailTestProvenance(prepared.applicationId, runKey, destination),
    payload: emailTestPayload(destination),
    emailTest: true as const,
    runKey,
  };
  const result = await deps.send(sendInput);
  const delivery = await readDelivery(deps.prisma, prepared.applicationId, prepared.attemptKey, destination);
  return {
    ok: true,
    applicationId: prepared.applicationId,
    runKey,
    destination,
    attemptKey: prepared.attemptKey,
    result,
    delivery,
  };
}

export async function readEmailTestDelivery(
  input: { runKey?: unknown; destination?: unknown },
  db: EmailTestDb = prisma,
): Promise<{ ok: true; applicationId: string; runKey: string; destination: string; attemptKey: string; delivery: EmailTestDelivery } | { ok: false; reason: EmailTestRefuseReason }> {
  const destination = parseEmailTestDestination(input.destination);
  if (!destination) return { ok: false, reason: "email_test_destination_refused" };
  const runKey = parseEmailTestRunKey(input.runKey);
  if (!runKey) return { ok: false, reason: "email_test_run_key_invalid" };
  const row = await db.emailTestAttempt.findUnique({ where: { runKey_destination: { runKey, destination } } });
  if (!row) return { ok: false, reason: "email_test_application_not_found" };
  const delivery = await readDelivery(db, row.applicationId, row.attemptKey, destination);
  return { ok: true, applicationId: row.applicationId, runKey, destination, attemptKey: row.attemptKey, delivery };
}
