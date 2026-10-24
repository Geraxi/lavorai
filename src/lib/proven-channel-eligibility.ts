/**
 * Proven-channel admission: Greenhouse forms we can answer truthfully, or a
 * published recruiter inbox on the employer's own domain. Never guesses
 * addresses or invents answers. Captcha is never solved.
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

export const GREENHOUSE_FORM_FETCH_BUDGET = 12;

export type ProvenJob = {
  url: string;
  sourceSlug?: string | null;
  company?: string | null;
  recruiterEmail?: string | null;
};

export type ProvenChannelUserContext = {
  factContext: FactContext;
  hasCv?: boolean;
  hasCoverLetter?: boolean;
};

export type ProvenChannelVerdict = {
  ok: boolean;
  channel: "recruiter_email" | "greenhouse" | null;
  reason: string;
};

export type ProvenChannelEvalOpts = {
  loadForm?: (input: { url: string; sourceSlug?: string | null }) => Promise<GreenhouseFormSnapshot | null>;
  formBudget?: { remaining: number };
  env?: Record<string, string | undefined>;
};

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
  if (!parsed) return { ok: false, channel: null, reason: "no_proven_channel" };
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
