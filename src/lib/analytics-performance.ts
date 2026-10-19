import { applicationEvidenceDate, deliveryEvidence, isConfirmedDelivery, type DeliveryEvidenceInput } from "@/lib/application-evidence";

/** Cohort analytics: confirmed applications sent during a calendar period (UTC by default; the Analisi page uses Europe/Rome). */
export const HUMAN_REPLY_KINDS = ["risposta", "colloquio", "rifiutata"];
const DAY = 86_400_000;
/** Calendar-day number (days since epoch) of `date` in `timeZone`. */
export function dayNumberIn(date: Date, timeZone = "UTC"): number {
  if (timeZone === "UTC") return Math.floor(+date / DAY);
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY);
}
/** First instant of calendar day `day` in `timeZone`. */
function startOfDayIn(day: number, timeZone: string): Date {
  const guess = day * DAY;
  if (timeZone === "UTC") return new Date(guess);
  // Shift by the zone offset at that moment (exact for whole-hour zones like Europe/Rome).
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asUtc - guess));
}
export function analyticsPeriod(days: number, now = new Date(), timeZone = "UTC") {
  const count = [7, 30, 90].includes(days) ? days : 30;
  const today = dayNumberIn(now, timeZone);
  return { days: count, timeZone, firstDay: today - (count - 1), start: startOfDayIn(today - (count - 1), timeZone), end: now };
}
export type PerformanceApplication = DeliveryEvidenceInput & {
  status: string; submittedVia: string | null; submitConfirmation: string | null;
  createdAt: Date; completedAt: Date | null; submittedAt: Date | null;
  userStatus: string | null; lastReplyAt: Date | null; lastReplyKind: string | null;
  replies: { receivedAt: Date; kind: string; isHuman: boolean; isSecurityCode?: boolean }[];
  gmailMessages: { date: Date; kind: string; isHuman: boolean }[];
  cvDocxPath: string | null; cvPdfPath: string | null;
  role: string; match: number | null;
};
export function aggregatePerformance(applications: PerformanceApplication[], days: number, now = new Date(), timeZone = "UTC") {
  const period = analyticsPeriod(days, now, timeZone);
  const buckets = Array.from({ length: period.days }, (_, i) => ({ date: new Date((period.firstDay + i) * DAY), sent: 0, replies: 0 }));
  const dayIndex = (d: Date) => dayNumberIn(d, timeZone) - period.firstDay;
  const cohort = applications.map(a => ({ ...a, evidence: deliveryEvidence(a), sentAt: applicationEvidenceDate(a) }))
    .filter(a => +a.sentAt >= +period.start && +a.sentAt <= +now);
  const rows = cohort.filter(a => isConfirmedDelivery(a.evidence))
    .map(a => {
      const sentAt = a.sentAt;
      const events = [...a.replies.filter(r => !r.isSecurityCode).map(r => ({ ...r, date: r.receivedAt })), ...a.gmailMessages];
      const human = events.filter(r => r.isHuman && HUMAN_REPLY_KINDS.includes(r.kind) && +r.date >= +sentAt && +r.date <= +now);
      // Legacy summary counters alone are not evidence of an actual reply.
      const responseAt = human.length ? new Date(Math.min(...human.map(r => +r.date))) : null;
      return { ...a, sentAt, responseAt, interview: a.userStatus === "colloquio" || human.some(r => r.kind === "colloquio") };
    }).filter(a => +a.sentAt >= +period.start && +a.sentAt <= +now);
  for (const a of rows) {
    buckets[dayIndex(a.sentAt)].sent++;
    if (a.responseAt) buckets[dayIndex(a.responseAt)].replies++;
  }
  const replied = rows.filter(a => a.responseAt).length;
  const matched = rows.filter(a => a.match !== null);
  const mean = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  const roles = [...new Set(rows.map(a => a.role))].map(role => {
    const group = rows.filter(a => a.role === role);
    return { role, sent: group.length, replies: group.filter(a => a.responseAt).length, match: mean(group.flatMap(a => a.match === null ? [] : [a.match])) };
  }).sort((a, b) => b.sent - a.sent);
  const segments = [true, false].map(high => {
    const group = matched.filter(a => high ? a.match! >= 70 : a.match! < 70);
    const responses = group.filter(a => a.responseAt).length;
    return { count: group.length, responses, rate: group.length ? responses / group.length * 100 : null };
  });
  return { ...period, buckets, sent: rows.length,
    portalConfirmed: cohort.filter(a => a.evidence === "confirmed_portal").length,
    emailDelivered: cohort.filter(a => a.evidence === "confirmed_email").length,
    providerAccepted: cohort.filter(a => a.evidence === "provider_accepted").length,
    legacyUnverified: cohort.filter(a => a.evidence === "legacy_unverified").length,
    deliveryProblems: cohort.filter(a => a.evidence === "delivery_problem").length,
    pending: cohort.filter(a => a.evidence === "pending").length,
    replied, responseRate: rows.length ? replied / rows.length * 100 : 0,
    interviews: rows.filter(a => a.interview).length, savedHours: rows.length / 4,
    match: mean(matched.map(a => a.match!)), tailored: rows.length ? Math.round(rows.filter(a => a.cvDocxPath || a.cvPdfPath).length / rows.length * 100) : null,
    lowMatch: matched.filter(a => a.match! < 60).length, roles, segments };
}
