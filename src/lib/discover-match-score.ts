import { quickMatchScore } from "./match-score";
import type { CVProfile } from "./cv-profile-types";

/** The filtering heuristic uses 100 as a missing-input sentinel, not a score. */
export function discoverMatchScore(profile: CVProfile | null, jobText: string): number | null {
  if (!profile) return null;
  const score = quickMatchScore(profile, jobText);
  return score === 100 ? null : score;
}
