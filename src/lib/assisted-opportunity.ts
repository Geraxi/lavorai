import type { Job } from '@prisma/client';
import { canonicalRecruiteeOffer } from './recruitee-form-capability';
import { OWNED_TEST_PREFIX, PUBLICATION_FRESH_MS } from './job-catalogue-policy';
import { autoApplyPreferenceMismatch, isAvoidedCompany, locationPreferenceMismatch } from './auto-apply-preferences';
import { titleMatchesAnyRole } from './role-match';

/** Review only. This result must never be used as submission authorization. */
export function assistedOpportunity(job: Job, preferences: {
 roles: string[]; locations: string[]; employmentType: string; salaryMin: number;
 sourcesJson: string; avoidCompanies: string | null; seniority: string | null; protectedCategory?: boolean;
}, now = new Date()) {
 const url = canonicalRecruiteeOffer(job.url);
 if (!url || url.startsWith(OWNED_TEST_PREFIX) || job.source !== 'recruitee' || job.closedAt ||
     job.applicationFormCapability !== 'questions' || !job.publicationVerifiedAt ||
     +job.publicationVerifiedAt > +now || +job.publicationVerifiedAt < +now-PUBLICATION_FRESH_MS) return null;
 if ((job.protectedCategory && !preferences.protectedCategory) || !preferences.roles.length || !preferences.locations.length ||
     !titleMatchesAnyRole(job.title, preferences.roles, preferences.seniority) ||
     isAvoidedCompany(job.company, preferences.avoidCompanies) ||
     locationPreferenceMismatch(job, preferences.locations) ||
     autoApplyPreferenceMismatch(job, preferences, preferences.locations)) return null;
 return { state: 'review_only' as const, canSubmit: false as const, url,
   requirements: ['candidate_answers', 'candidate_approval', 'form_and_challenge_verification'] as const };
}
