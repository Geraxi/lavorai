import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { deliveryEvidence, isConfirmedDelivery, type DeliveryEvidenceInput } from "@/lib/application-evidence";
import type { AdminPeriod } from "@/lib/admin-growth-metrics";
export function confirmedApplication(app: DeliveryEvidenceInput) { return isConfirmedDelivery(deliveryEvidence(app)); }
export function setupStages(users: Array<{ verified: boolean; cv: boolean; preferences: boolean; submitted: boolean; response: boolean }>) {
  const predicates = [(u: typeof users[number]) => u.verified, (u: typeof users[number]) => u.cv, (u: typeof users[number]) => u.preferences, (u: typeof users[number]) => u.submitted, (u: typeof users[number]) => u.response];
  let cohort = users;
  return predicates.map((predicate, index) => { const entering = cohort.length; cohort = cohort.filter(predicate); return { index, entering, completed: cohort.length, withoutEvidence: entering - cohort.length }; });
}
/** Admin-only, first-party aggregates. No CV/email bodies leave this loader. */
export async function loadActivationEvidence(viewerEmail: string | null | undefined, period: AdminPeriod) {
  if (!isAdmin(viewerEmail)) throw new Error("Admin required");
  const until = period.until ?? new Date();
  const users: Array<{ id: string; verified: boolean; cv: boolean; preferences: boolean; submitted: boolean; response: boolean }> = [];
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.user.findMany({ where: { createdAt: { gte: period.since, lte: until } }, orderBy: { id: "asc" }, take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, email: true, emailVerified: true, _count: { select: { cvDocuments: true } }, preferences: { select: { rolesJson: true } } } });
    for (const u of batch) { if (isTestAccount(u.email)) continue; let roles: unknown = []; try { roles = JSON.parse(u.preferences?.rolesJson ?? "[]"); } catch { /* incomplete */ }
      users.push({ id: u.id, verified: !!u.emailVerified, cv: u._count.cvDocuments > 0, preferences: Array.isArray(roles) && roles.some(r => typeof r === "string" && !!r.trim()), submitted: false, response: false }); }
    if (batch.length < 200) break; cursor = batch[batch.length - 1].id;
  }
  const byId = new Map(users.map(u => [u.id, u])); let unverifiedLegacy = 0;
  for (let offset = 0; offset < users.length; offset += 200) {
    const ids = users.slice(offset, offset + 200).map(u => u.id); cursor = undefined;
    while (true) {
      const apps: Array<Prisma.ApplicationGetPayload<{ select: { id: true; userId: true; status: true; submittedVia: true; submitConfirmation: true; submissionReceiptJson: true; emailAttempts: { select: { status: true; providerEmailId: true } }; replies: { select: { id: true } }; gmailMessages: { select: { userId: true } } } }>> = await prisma.application.findMany({ where: { userId: { in: ids }, status: { not: "diagnostic" } }, orderBy: { id: "asc" }, take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, userId: true, status: true, submittedVia: true, submitConfirmation: true, submissionReceiptJson: true,
          emailAttempts: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, providerEmailId: true } },
          replies: { where: { isHuman: true, isSecurityCode: false, kind: { in: ["risposta", "colloquio", "rifiutata"] } }, take: 1, select: { id: true } },
          gmailMessages: { where: { userId: { in: ids }, isHuman: true, kind: { in: ["risposta", "colloquio", "rifiutata"] } }, take: 1, select: { userId: true } } } });
      for (const app of apps) { const user = byId.get(app.userId); if (!user) continue;
        if (confirmedApplication(app)) user.submitted = true;
        if (deliveryEvidence(app) === "legacy_unverified") unverifiedLegacy++;
        if (app.submittedVia !== "mock_demo" && (app.replies.length || app.gmailMessages.some(m => m.userId === app.userId))) user.response = true;
      }
      if (apps.length < 200) break; cursor = apps[apps.length - 1].id;
    }
  }
  // Missing instrumentation/query failures are unknown, never a fabricated zero.
  let observations: { card: number | null; googleStarts: number | null; googleFailures: number | null } = { card: null, googleStarts: null, googleFailures: null };
  try {
    const [cards, starts, failures] = await Promise.all([
      prisma.conversionEvent.findMany({ where: { userId: { in: users.map(u => u.id) }, name: "card_setup_confirmed", source: "stripe_verified" }, distinct: ["userId"], select: { userId: true } }),
      prisma.conversionEvent.count({ where: { name: "google_login_started_observed", source: "google_client_observation", createdAt: { gte: period.since, lte: until } } }),
      prisma.conversionEvent.count({ where: { name: "google_login_failure_observed", source: "google_client_observation", createdAt: { gte: period.since, lte: until } } }),
    ]);
    observations = { card: cards.length || null, googleStarts: starts || null, googleFailures: failures || null };
  } catch { /* explicitly unknown */ }
  return { cohort: users.length, stages: setupStages(users), firstConfirmed: users.filter(u => u.submitted).length, recruiterResponse: users.filter(u => u.response).length, unverifiedLegacy, observations };
}
