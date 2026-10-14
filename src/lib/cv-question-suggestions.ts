import type { CVProfile } from "@/lib/cv-profile-types";
import { candidateFacts, resolveCandidateFact } from "./candidate-facts";

/** Suggestions and ATS filling share the same factual mapper. */
export function suggestAnswerFromCv(label: string, kind: string, options: string[] | undefined, profile: CVProfile | null, yearsExperience?: number | null): string | null {
  return resolveCandidateFact({ label, kind, options }, { facts: candidateFacts(profile, { yearsExperience }) }).answer;
}
