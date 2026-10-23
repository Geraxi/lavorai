import type { Prisma } from "@prisma/client";
import { deliveryEvidence, isConfirmedDelivery, type DeliveryEvidenceInput } from "./application-evidence";

const DAY = 86_400_000;
/** Half-open windows share one clock: no gaps, overlaps, or future records. */
export function applicationWindow(now: number, days: number, excludedIds: string[]): Prisma.ApplicationWhereInput {
  return { userId: { notIn: excludedIds }, createdAt: { gte: new Date(now - days * DAY), lt: new Date(now) } };
}
export function creationMetrics(rows: { createdAt: Date }[], now: number) {
  const start = now - 28 * DAY;
  const series = Array<number>(28).fill(0);
  for (const row of rows) {
    const index = Math.floor((+row.createdAt - start) / DAY);
    if (index >= 0 && index < 28) series[index]++;
  }
  const previous = series.slice(0, 14).reduce((a, b) => a + b, 0);
  const current = series.slice(14).reduce((a, b) => a + b, 0);
  return { total: current + previous, current, previous, series,
    delta: previous ? (current - previous) / previous * 100 : undefined };
}
/** Evidence describes this creation cohort, not deliveries occurring in the window. */
export function cohortDeliveryMetrics(rows: DeliveryEvidenceInput[]) {
  const result = { verified: 0, accepted: 0, unverified: 0, problems: 0, other: 0 };
  for (const row of rows) {
    const evidence = deliveryEvidence(row);
    if (isConfirmedDelivery(evidence)) result.verified++;
    else if (evidence === "provider_accepted") result.accepted++;
    else if (evidence === "legacy_unverified" || (row.status === "success" && evidence === "excluded" && !row.submittedVia && !row.submitConfirmation)) result.unverified++;
    else if (evidence === "delivery_problem") result.problems++;
    else result.other++;
  }
  return result;
}
