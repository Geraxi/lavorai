import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { TIERS } from "@/lib/billing";

export type AdminPeriod = { days: number; since: Date; previousSince: Date; previousUntil: Date; label: string };

export function adminPeriod(input: { range?: string; from?: string; to?: string }): AdminPeriod {
  const now = new Date();
  const requested = Number(input.range);
  let days = [7, 30, 90].includes(requested) ? requested : 30;
  if (input.range === "custom" && input.from && input.to) {
    const from = new Date(`${input.from}T00:00:00.000Z`);
    const to = new Date(`${input.to}T23:59:59.999Z`);
    const diff = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
    if (!Number.isNaN(diff) && diff >= 1 && diff <= 365) {
      return { days: diff, since: from, previousSince: new Date(from.getTime() - diff * 86_400_000), previousUntil: from, label: `${input.from} → ${input.to}` };
    }
  }
  return { days, since: new Date(now.getTime() - days * 86_400_000), previousSince: new Date(now.getTime() - days * 2 * 86_400_000), previousUntil: new Date(now.getTime() - days * 86_400_000), label: `ultimi ${days} giorni` };
}

type MetricUser = {
  id: string; email: string; createdAt: Date; emailVerified: Date | null; onboardedAt: Date | null;
  tier: string; subscriptionStatus: string | null; trialEndsAt: Date | null; lastLoginAt: Date | null; suspendedAt: Date | null;
  signupSource: string | null; signupUtmSource: string | null; signupReferrer: string | null; signupLandingPath: string | null;
  _count: { applications: number; cvDocuments: number };
  cvProfile: { id: string } | null;
};

export type UpgradeReadyUser = { id: string; email: string; score: number; applications: number; completed: string[]; trialEndsAt: Date | null; lastLoginAt: Date | null };

const paid = (u: MetricUser) => (u.tier === "pro" || u.tier === "pro_plus") && u.subscriptionStatus === "active";
const hasCv = (u: MetricUser) => u._count.cvDocuments > 0 || Boolean(u.cvProfile);

export async function loadAdminGrowthMetrics(period: AdminPeriod) {
  const [rawUsers, events, views, previousUsers, applications] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true, email: true, createdAt: true, emailVerified: true, onboardedAt: true, tier: true, subscriptionStatus: true,
        trialEndsAt: true, lastLoginAt: true, suspendedAt: true, signupSource: true, signupUtmSource: true, signupReferrer: true, signupLandingPath: true,
        _count: { select: { applications: true, cvDocuments: true } }, cvProfile: { select: { id: true } },
      },
    }),
    prisma.conversionEvent.findMany({ where: { createdAt: { gte: period.since } }, select: { name: true, userId: true, sessionId: true, source: true, plan: true, createdAt: true } }).catch(() => []),
    prisma.pageView.findMany({ where: { ts: { gte: period.since } }, select: { sessionId: true, path: true, ts: true, userId: true } }).catch(() => []),
    prisma.user.findMany({ where: { createdAt: { gte: period.previousSince, lt: period.previousUntil } }, select: { email: true } }),
    prisma.application.findMany({ where: { createdAt: { gte: period.since } }, select: { id: true, userId: true, status: true, createdAt: true, submittedAt: true, submitConfirmation: true, pendingQuestionsJson: true } }),
  ]);
  const users = rawUsers.filter((user) => !isTestAccount(user.email)) as MetricUser[];
  const currentUsers = users.filter((u) => u.createdAt >= period.since);
  const previousSignups = previousUsers.filter((u) => !isTestAccount(u.email)).length;
  const unique = (values: Array<string | null | undefined>) => new Set(values.filter(Boolean) as string[]).size;
  const usersFor = (predicate: (u: MetricUser) => boolean) => currentUsers.filter(predicate).length;
  const activationUsers = currentUsers.filter((u) => Boolean(u.emailVerified) && hasCv(u) && Boolean(u.onboardedAt) && u._count.applications > 0);
  const activePaid = users.filter(paid);
  const mrr = activePaid.reduce((sum, u) => sum + (u.tier === "pro_plus" ? TIERS.pro_plus.price : TIERS.pro.price), 0);
  const bySource = new Map<string, number>();
  const byLanding = new Map<string, number>();
  for (const u of currentUsers) {
    const source = u.signupUtmSource || u.signupSource || u.signupReferrer || "direct / unknown";
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
    const path = u.signupLandingPath || "not captured";
    byLanding.set(path, (byLanding.get(path) ?? 0) + 1);
  }
  const sourceRows = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
  const landingRows = [...byLanding.entries()].sort((a, b) => b[1] - a[1]);
  const visitorSessions = unique(views.map((view) => view.sessionId));
  const eventUsers = (name: string) => unique(events.filter((event) => event.name === name).map((event) => event.userId || event.sessionId));
  const funnel = [
    { label: "Visitatori", value: visitorSessions, href: "/admin/traffic" },
    { label: "Registrati", value: currentUsers.length, href: "/admin/users" },
    { label: "Email verificata", value: usersFor((u) => Boolean(u.emailVerified)), href: "/admin/users?verified=yes" },
    { label: "CV caricato", value: usersFor(hasCv), href: "/admin/users?cv=yes" },
    { label: "Onboarding completato", value: usersFor((u) => Boolean(u.onboardedAt)), href: "/admin/users?onboarded=yes" },
    { label: "Prima candidatura", value: usersFor((u) => u._count.applications > 0), href: "/admin/users?apps=1" },
    { label: "3+ candidature", value: usersFor((u) => u._count.applications >= 3), href: "/admin/users?apps=3" },
    { label: "Checkout avviato", value: eventUsers("checkout_started"), href: "/admin/users?checkout=started" },
    { label: "Pagamento riuscito", value: eventUsers("purchase_completed"), href: "/admin/users?plan=paying" },
  ];
  const drops = funnel.slice(1).map((stage, index) => ({ label: `${funnel[index].label} → ${stage.label}`, drop: Math.max(0, funnel[index].value - stage.value) })).sort((a, b) => b.drop - a.drop);
  const upgradeReady = users.filter((u) => !paid(u) && !u.suspendedAt).map((u) => {
    const completed: string[] = [];
    let score = 0;
    if (u.emailVerified) { score += 10; completed.push("email verificata"); }
    if (u.onboardedAt) { score += 20; completed.push("onboarding"); }
    if (hasCv(u)) { score += 20; completed.push("CV"); }
    if (u._count.applications >= 3) { score += 10; completed.push("3+ candidature"); }
    if (u.lastLoginAt && u.lastLoginAt >= period.since) { score += 5; completed.push("attivo nel periodo"); }
    if (u.trialEndsAt && u.trialEndsAt <= new Date()) { score += 15; completed.push("trial terminata"); }
    return { id: u.id, email: u.email, score, applications: u._count.applications, completed, trialEndsAt: u.trialEndsAt, lastLoginAt: u.lastLoginAt };
  }).filter((u) => u.score >= 30).sort((a, b) => b.score - a.score).slice(0, 25);
  const appByStatus = new Map<string, number>();
  for (const app of applications) appByStatus.set(app.status, (appByStatus.get(app.status) ?? 0) + 1);
  const delivered = applications.filter((app) => app.status === "success").length;
  const confirmed = applications.filter((app) => app.submitConfirmation?.startsWith("DETECTED")).length;
  return {
    period, users, currentUsers, activePaid, mrr, previousSignups, events, views, applications, sourceRows, landingRows, funnel, drops,
    activationUsers, activationRate: currentUsers.length ? (activationUsers.length / currentUsers.length) * 100 : 0,
    verified: usersFor((u) => Boolean(u.emailVerified)), cvUploaded: usersFor(hasCv), onboarded: usersFor((u) => Boolean(u.onboardedAt)),
    firstApplication: usersFor((u) => u._count.applications > 0), upgradeReady, appByStatus: [...appByStatus.entries()].sort((a,b) => b[1] - a[1]), delivered, confirmed,
  };
}
