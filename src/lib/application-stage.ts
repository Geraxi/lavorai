import { deliveryEvidence, isConfirmedDelivery, type DeliveryEvidenceInput } from "@/lib/application-evidence";
import { journeyStage, type JourneyStage } from "@/lib/ui-application-status";

/**
 * Pure, DB-free application classifiers shared by every page.
 * Re-exported by src/lib/dashboard-metrics-shared.ts (the single source of
 * truth for counts); kept here so list/index code can use them without
 * importing the Prisma client.
 */

export interface StageInput extends DeliveryEvidenceInput {
  userStatus?: string | null;
  lastReplyKind?: string | null;
}

/**
 * Journey stage with delivery evidence applied:
 * - "sent" only with a verified portal receipt or a delivered email (same rule
 *   as the "Invii confermati" KPI);
 * - "submitted" when the email provider accepted the message but delivery is
 *   not confirmed yet;
 * - provider bounces / failures are "stopped";
 * - "success" without evidence stays "unverified".
 * Diagnostic rows are excluded (null).
 */
export function applicationStage(app: StageInput): JourneyStage | null {
  if (app.status === "diagnostic") return null;
  const evidence = deliveryEvidence(app);
  if (isConfirmedDelivery(evidence)) return "sent";
  if (evidence === "provider_accepted") return "submitted";
  if (evidence === "delivery_problem") return "stopped";
  return journeyStage(app.status);
}

/** Interview evidence: recruiter reply classified as interview, or declared by the user. */
export function isInterviewEvidence(app: { userStatus?: string | null; lastReplyKind?: string | null }): boolean {
  return app.userStatus === "colloquio" || app.lastReplyKind === "colloquio";
}

/** Offers are user-declared only. */
export function isOffer(app: { userStatus?: string | null }): boolean {
  return app.userStatus === "offerta";
}

/** Stages that need the user (approval, answers, sign-in or manual send). */
export const ACTION_STAGES: readonly JourneyStage[] = ["awaiting_approval", "manual"];

export function needsUserAction(stage: JourneyStage | null): boolean {
  return stage !== null && ACTION_STAGES.includes(stage);
}

export type StageCounts = Record<JourneyStage, number>;

export function emptyStageCounts(): StageCounts {
  return { preparing: 0, prepared: 0, awaiting_approval: 0, approved: 0, manual: 0, in_flight: 0, submitted: 0, sent: 0, unverified: 0, stopped: 0 };
}
