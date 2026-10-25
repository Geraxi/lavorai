import type { JourneyStage } from "@/lib/ui-application-status";

/** Semantic colour of a status dot / pill / bar segment. */
export type Tone = "green" | "amber" | "red" | "neutral";

/** Display order of application journey stages everywhere in the app. */
export const STAGE_ORDER: JourneyStage[] = [
  "awaiting_approval",
  "manual",
  "preparing",
  "prepared",
  "approved",
  "in_flight",
  "submitted",
  "email_delivered",
  "sent",
  "sent_no_bounce",
  "sent_unverified",
  "outcome_unknown",
  "unverified",
  "stopped",
];

/**
 * One colour per stage, shared by dashboard, Candidature and Analisi.
 * Green is reserved for evidence (sent with proof); amber = needs a look;
 * red = stopped; neutral = system still working.
 */
export const STAGE_TONE: Record<JourneyStage, Tone> = {
  preparing: "neutral",
  prepared: "neutral",
  awaiting_approval: "amber",
  approved: "neutral",
  manual: "amber",
  in_flight: "neutral",
  submitted: "neutral",
  email_delivered: "neutral",
  sent: "green",
  sent_no_bounce: "amber",
  sent_unverified: "amber",
  outcome_unknown: "amber",
  unverified: "amber",
  stopped: "red",
};
