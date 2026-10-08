/** Cohort analytics: confirmed applications sent during a UTC calendar period. */
export const HUMAN_REPLY_KINDS = ["risposta", "colloquio", "rifiutata"];
const DAY = 86_400_000;
export function analyticsPeriod(days: number, now = new Date()) {
  const count = [7, 30, 90].includes(days) ? days : 30;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { days: count, start: new Date(today - (count - 1) * DAY), end: now };
}
export type PerformanceApplication = {
  status: string; submittedVia: string | null; submitConfirmation: string | null;
  createdAt: Date; completedAt: Date | null; submittedAt: Date | null;
  userStatus: string | null; lastReplyAt: Date | null; lastReplyKind: string | null;
  replies: { receivedAt: Date; kind: string; isHuman: boolean }[];
  gmailMessages: { date: Date; kind: string; isHuman: boolean }[];
  cvDocxPath: string | null; cvPdfPath: string | null;
  role: string; match: number | null;
};
export function aggregatePerformance(applications: PerformanceApplication[], days: number, now = new Date()) {
  const period = analyticsPeriod(days, now);
  const buckets = Array.from({ length: period.days }, (_, i) => ({ date: new Date(+period.start + i * DAY), sent: 0, replies: 0 }));
  const rows = applications.filter(a => a.status === "success" && a.submittedVia && a.submittedVia !== "mock_demo" && !["DRY_RUN", "UNCONFIRMED"].includes(a.submitConfirmation ?? ""))
    .map(a => {
      const sentAt = a.submittedAt ?? a.completedAt ?? a.createdAt;
      const events = [...a.replies.map(r => ({ ...r, date: r.receivedAt })), ...a.gmailMessages];
      const human = events.filter(r => r.isHuman && HUMAN_REPLY_KINDS.includes(r.kind) && +r.date >= +sentAt && +r.date <= +now);
      // Older records may predate the message tables. Only use explicitly human kinds.
      if (!events.length && a.lastReplyAt && HUMAN_REPLY_KINDS.includes(a.lastReplyKind ?? "") && +a.lastReplyAt >= +sentAt && +a.lastReplyAt <= +now) {
        human.push({ date: a.lastReplyAt, kind: a.lastReplyKind!, isHuman: true });
      }
      const responseAt = human.length ? new Date(Math.min(...human.map(r => +r.date))) : null;
      return { ...a, sentAt, responseAt, interview: a.userStatus === "colloquio" || human.some(r => r.kind === "colloquio") };
    }).filter(a => +a.sentAt >= +period.start && +a.sentAt <= +now);
  for (const a of rows) {
    buckets[Math.floor((+a.sentAt - +period.start) / DAY)].sent++;
    if (a.responseAt) buckets[Math.floor((+a.responseAt - +period.start) / DAY)].replies++;
  }
  const replied = rows.filter(a => a.responseAt).length;
  const matched = rows.filter(a => a.match !== null);
  const mean = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  const roles = [...new Set(rows.map(a => a.role))].map(role => {
    const group = rows.filter(a => a.role === role);
    return { role, sent: group.length, replies: group.filter(a => a.responseAt).length, match: mean(group.flatMap(a => a.match === null ? [] : [a.match])) };
  }).sort((a, b) => b.sent - a.sent);
  const segments = [true, false].map(high => {
    const group = matched.filter(a => high ? a.match! > 70 : a.match! <= 70);
    const responses = group.filter(a => a.responseAt).length;
    return { count: group.length, responses, rate: group.length ? responses / group.length * 100 : null };
  });
  return { ...period, buckets, sent: rows.length, replied, responseRate: rows.length ? replied / rows.length * 100 : 0,
    interviews: rows.filter(a => a.interview).length, savedHours: rows.length / 4,
    match: mean(matched.map(a => a.match!)), tailored: rows.length ? Math.round(rows.filter(a => a.cvDocxPath || a.cvPdfPath).length / rows.length * 100) : null,
    lowMatch: matched.filter(a => a.match! < 60).length, roles, segments };
}
