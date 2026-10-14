import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { aggregateAdminPreferences } from "@/lib/admin-preference-metrics";

/** Called only after the admin page guard. All-time current preferences, no sampling. */
export async function loadAdminPreferenceReport(includeTest = false) {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, preferences: { select: { rolesJson: true } } },
  });
  const internalUsers = users.filter((user) => isTestAccount(user.email)).length;
  return {
    ...aggregateAdminPreferences(includeTest ? users : users.filter((user) => !isTestAccount(user.email))),
    excludedInternalUsers: includeTest ? 0 : internalUsers,
  };
}
