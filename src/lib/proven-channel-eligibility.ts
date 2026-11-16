/**
 * Proven-channel admission: Greenhouse forms we can answer truthfully, a
 * published recruiter inbox on the employer's own domain, or a public portal
 * form channel listed in PROVEN_CHANNEL_PORTALS (default: Recruitee, the only
 * portal with confirmed receipts). Lever/Workable/Personio are admitted only
 * when listed AND the cheap HTTP form pre-check finds the public form.
 * Never guesses addresses or invents answers. Captcha is never solved.
 */
import { parseAnswers } from "@/lib/application-answers";
import { prefersRemoteOrHybrid } from "@/lib/auto-apply-preferences";
import {
  candidateFacts,
  type FactContext,
  type SavedFactAnswer,
} from "@/lib/candidate-facts";
import { rowToProfile } from "@/lib/cv-profile-types";
import {
  greenhouseRequiredQuestionsAnswerable,
  loadGreenhouseJobForm,
  parseGreenhouseBoardJob,
  type GreenhouseFormSnapshot,
} from "@/lib/greenhouse-job-form";
import { employerDomainAllowsRecipient } from "@/lib/recruiter-email";
import { probePortalForm, type FormProbeResult } from "@/lib/portal-adapters/form-probe";

export const GREENHOUSE_FORM_FETCH_BUDGET = 12;

export type ProvenJob = {
  url: string;
  sourceSlug?: string | null;
  company?: string | null;
  recruiterEmail?: string | null;
  /** Catalogue form classification (Recruitee): standard | questions | unsupported | closed | unknown. */
  applicationFormCapability?: string | null;
};

export type ProvenChannelUserContext = {
  factContext: FactContext;
  hasCv?: boolean;
  hasCoverLetter?: boolean;
};

export type ProvenChannelVerdict = {
  ok: boolean;
  channel: "recruiter_email" | "greenhouse" | PortalChannel | null;
  reason: string;
};

export type ProvenChannelEvalOpts = {
  loadForm?: (input: { url: string; sourceSlug?: string | null }) => Promise<GreenhouseFormSnapshot | null>;
  /** Public apply-form pre-check for Lever/Personio/Workable (HTTP only, never submits). */
  probeForm?: (adapterId: string, url: string) => Promise<FormProbeResult>;
  formBudget?: { remaining: number };
  env?: Record<string, string | undefined>;
};

export const PORTAL_CHANNELS = ["recruitee", "lever", "workable", "personio"] as const;
export type PortalChannel = (typeof PORTAL_CHANNELS)[number];
/** Recruitee is the only portal with confirmed ATS receipts (Oct–Nov 2026). */
export const DEFAULT_PROVEN_PORTALS: PortalChannel[] = ["recruitee"];

/**
 * Portal channels admitted besides Greenhouse + published email.
 * PROVEN_CHANNEL_PORTALS="recruitee,lever,personio" (comma list); unset →
 * default (Recruitee). "none" disables portal channels. Unknown names ignored.
 */
export function provenPortalChannels(env: Record<string, string | undefined> = process.env): PortalChannel[] {
  const raw = env.PROVEN_CHANNEL_PORTALS;
  if (raw == null || !raw.trim()) return [...DEFAULT_PROVEN_PORTALS];
  if (raw.trim().toLowerCase() === "none") return [];
  const listed = raw.split(",").map((value) => value.trim().toLowerCase());
  return PORTAL_CHANNELS.filter((channel) => listed.includes(channel));
}

export function portalChannelOf(url: string): PortalChannel | null {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (/(^|\.)recruitee\.com$/.test(host)) return "recruitee";
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") return "lever";
  if (host === "apply.workable.com" || /(^|\.)workable\.com$/.test(host)) return "workable";
  if (/(^|\.)jobs\.personio\.(de|com)$/.test(host)) return "personio";
  return null;
}

async function evaluatePortalChannel(
  job: ProvenJob,
  channel: PortalChannel,
  opts: ProvenChannelEvalOpts,
): Promise<ProvenChannelVerdict> {
  if (channel === "recruitee") {
    // The catalogue classifier already rejects closed/unsupported (upload-only) forms.
    if (job.applicationFormCapability === "closed") return { ok: false, channel, reason: "recruitee_closed" };
    if (job.applicationFormCapability === "unsupported") return { ok: false, channel, reason: "recruitee_form_unsupported" };
    return { ok: true, channel, reason: "recruitee_portal" };
  }
  if (opts.formBudget && opts.formBudget.remaining <= 0) return { ok: false, channel, reason: `${channel}_form_budget` };
  if (opts.formBudget) opts.formBudget.remaining -= 1;
  const probe = await (opts.probeForm ?? ((id: string, url: string) => probePortalForm(id, url)))(channel, job.url)
    .catch((): FormProbeResult => ({ status: "unknown", detail: "probe_failed" }));
  if (probe.status !== "present") return { ok: false, channel, reason: `${channel}_form_precheck_${probe.status}` };
  return { ok: true, channel, reason: `${channel}_form_present` };
}

export function publishedEmployerEmailEligible(job: ProvenJob): boolean {
  const email = job.recruiterEmail?.trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  return employerDomainAllowsRecipient(email, job.company ?? null, job.url);
}

/** Greenhouse OTP lands on reply+<appId>@INBOUND_EMAIL_DOMAIN (inbound.lavorai.it). */
export function greenhouseInboundReady(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.INBOUND_ROUTE_ATS_EMAIL === "false") return false;
  const domain = (env.INBOUND_EMAIL_DOMAIN ?? "").trim().toLowerCase();
  return Boolean(domain && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(domain));
}

export function buildProvenChannelFactContext(input: {
  profile: Parameters<typeof rowToProfile>[0] | null;
  user: {
    email?: string | null;
    name?: string | null;
    yearsExperience?: number | null;
    englishLevel?: string | null;
    noticePeriod?: string | null;
    privacyConsentAt?: Date | string | null;
  };
  applicationAnswersJson?: string | null;
  locationsJson?: string | null;
  savedAnswers?: SavedFactAnswer[];
  company?: string | null;
}): FactContext {
  const profile = input.profile ? rowToProfile(input.profile) : null;
  const answers = parseAnswers(input.applicationAnswersJson);
  const saved = input.savedAnswers ?? [];
  return {
    facts: candidateFacts(profile, input.user, answers, saved),
    storedAnswers: saved
      .filter((row) => row.answer?.trim())
      .map((row) => ({ label: row.label, answer: row.answer!.trim(), kind: row.kind })),
    firstName: profile?.firstName,
    lastName: profile?.lastName,
    email: profile?.email ?? input.user.email,
    phone: profile?.phone,
    city: profile?.city,
    country: answers.country ?? null,
    privacyConsentAt: input.user.privacyConsentAt,
    workRemote: prefersRemoteOrHybrid(input.locationsJson),
    company: input.company,
    employers: profile?.experiences.map((e) => e.company).filter(Boolean) ?? null,
  };
}

export async function evaluateProvenChannelEligibility(
  job: ProvenJob,
  user: ProvenChannelUserContext,
  opts: ProvenChannelEvalOpts = {},
): Promise<ProvenChannelVerdict> {
  if (publishedEmployerEmailEligible(job)) {
    return { ok: true, channel: "recruiter_email", reason: "published_employer_email" };
  }
  const parsed = parseGreenhouseBoardJob(job.url, job.sourceSlug);
  if (!parsed) {
    const portal = portalChannelOf(job.url);
    if (portal && provenPortalChannels(opts.env).includes(portal)) return evaluatePortalChannel(job, portal, opts);
    return { ok: false, channel: portal, reason: portal ? `${portal}_not_enabled` : "no_proven_channel" };
  }
  if (!greenhouseInboundReady(opts.env)) {
    return { ok: false, channel: "greenhouse", reason: "greenhouse_inbound_unconfigured" };
  }
  if (opts.formBudget && opts.formBudget.remaining <= 0) {
    return { ok: false, channel: "greenhouse", reason: "greenhouse_form_budget" };
  }
  if (opts.formBudget) opts.formBudget.remaining -= 1;
  const form = await (opts.loadForm ?? loadGreenhouseJobForm)({
    url: job.url,
    sourceSlug: job.sourceSlug,
  });
  if (!form) return { ok: false, channel: "greenhouse", reason: "greenhouse_form_unavailable" };
  if (form.status === "redirected") {
    return { ok: false, channel: "greenhouse", reason: "greenhouse_redirected" };
  }
  if (form.status !== "native") {
    return { ok: false, channel: "greenhouse", reason: "greenhouse_form_unavailable" };
  }
  const answers = greenhouseRequiredQuestionsAnswerable(form.questions, user.factContext, {
    hasCv: user.hasCv !== false,
    hasCoverLetter: user.hasCoverLetter,
  });
  if (!answers.ok) return { ok: false, channel: "greenhouse", reason: "greenhouse_unanswerable" };
  return { ok: true, channel: "greenhouse", reason: "greenhouse_answerable" };
}
