/**
 * Cheap recruiter-email lookup for skip-list hosts (Ashby by default).
 * Description + employer-domain discovery only — no CV/AI, no job-page crawl
 * beyond discovery's bounded budget. Never invents an address.
 */
import { discoverPublishedHiringInbox } from "@/lib/employer-hiring-inbox";
import {
  findVerifiedRecruiterEmail,
  type RecruiterEmailLookup,
  type VerifiedRecruiterEmail,
} from "@/lib/recruiter-email";
import { isSkippedPortalUrl } from "@/lib/ats-skip-hosts";

export type SkipListLookupJob = {
  url: string;
  company: string | null;
  description?: string | null;
  recruiterEmail?: string | null;
  recruiterEmailSourceUrl?: string | null;
  companyWebsite?: string | null;
};

export type SkipListLookupDeps = {
  findVerified?: typeof findVerifiedRecruiterEmail;
  discover?: typeof discoverPublishedHiringInbox;
};

export function skipListRecruiterLookupExtras(
  job: SkipListLookupJob,
  discover: RecruiterEmailLookup["discoverEmployerInbox"] = discoverPublishedHiringInbox,
): RecruiterEmailLookup {
  return {
    description: job.description,
    cachedSourceUrl: job.recruiterEmailSourceUrl,
    companyWebsite: job.companyWebsite,
    skipPageFetch: true,
    discoverEmployerInbox: discover,
  };
}

/** Published inbox only. Null means hand off — do not reserve a daily slot. */
export async function lookupPublishedSkipListInbox(
  job: SkipListLookupJob,
  deps: SkipListLookupDeps = {},
): Promise<VerifiedRecruiterEmail | null> {
  if (!isSkippedPortalUrl(job.url) || !job.company?.trim()) return null;
  const find = deps.findVerified ?? findVerifiedRecruiterEmail;
  const discover = deps.discover ?? discoverPublishedHiringInbox;
  return find(job.url, job.company, job.recruiterEmail, skipListRecruiterLookupExtras(job, discover));
}
