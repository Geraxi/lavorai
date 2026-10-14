import { isTestAccount } from "@/lib/admin";
import { classifyAdminRole, normalizeAdminRole } from "@/lib/admin-role-taxonomy";

type PreferenceUser = {
  id: string;
  email: string | null;
  preferences: { rolesJson: string | null } | null;
};

function readRoles(json: string | null): { roles: string[]; invalid: boolean } {
  if (json == null) return { roles: [], invalid: true };
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return { roles: [], invalid: true };
    return {
      roles: value.filter((role): role is string => typeof role === "string").map(normalizeAdminRole).filter(Boolean),
      invalid: value.some((role) => typeof role !== "string"),
    };
  } catch {
    return { roles: [], invalid: true };
  }
}

/** Receives the complete, already-filtered admin cohort. Returns aggregates only. */
export function aggregateAdminPreferences(users: readonly PreferenceUser[]) {
  const distinct = new Map<string, { roles: Set<string>; hasPreferences: boolean; invalid: boolean; internal: boolean }>();
  for (const user of users) {
    const entry = distinct.get(user.id) ?? {
      roles: new Set<string>(), hasPreferences: false, invalid: false, internal: isTestAccount(user.email),
    };
    if (user.preferences) {
      const parsed = readRoles(user.preferences.rolesJson);
      entry.hasPreferences = true;
      entry.invalid ||= parsed.invalid;
      parsed.roles.forEach((role) => entry.roles.add(role));
    }
    distinct.set(user.id, entry);
  }

  const totalUsers = distinct.size;
  const percentage = (count: number) => totalUsers ? count / totalUsers * 100 : 0;
  const counts = new Map<string, number>();
  const areaCounts = new Map<string, number>();
  let classifiedUsers = 0, unclassifiedUsers = 0, unclassifiedOnlyUsers = 0, unclassifiedPairs = 0;
  let withRoles = 0, missingPreferences = 0, emptyRoles = 0, invalidWithoutRoles = 0, invalidRoleData = 0, internalUsers = 0;
  for (const user of distinct.values()) {
    if (user.internal) internalUsers++;
    if (user.invalid) invalidRoleData++;
    if (user.roles.size) {
      withRoles++;
      const areas = new Set<string>();
      let unknown = 0;
      user.roles.forEach((value) => {
        const match = classifyAdminRole(value);
        if (!match) { unknown++; return; }
        counts.set(match.role, (counts.get(match.role) ?? 0) + 1);
        areas.add(match.area);
      });
      if (areas.size) classifiedUsers++;
      if (unknown) {
        unclassifiedUsers++;
        unclassifiedPairs += unknown;
        if (!areas.size) unclassifiedOnlyUsers++;
      }
      areas.forEach((area) => areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1));
    } else if (!user.hasPreferences) missingPreferences++;
    else if (user.invalid) invalidWithoutRoles++;
    else emptyRoles++;
  }
  return {
    totalUsers, internalUsers, realUsers: totalUsers - internalUsers,
    withRoles, withoutRoles: totalUsers - withRoles, coveragePercent: percentage(withRoles),
    missingPreferences, emptyRoles, invalidWithoutRoles, invalidRoleData,
    classifiedUsers, classificationPercent: percentage(classifiedUsers),
    unclassifiedUsers, unclassifiedOnlyUsers, unclassifiedPairs,
    roles: [...counts].map(([role, users]) => ({ role, users, percent: percentage(users) }))
      .sort((a, b) => b.users - a.users || a.role.localeCompare(b.role, "it-IT")),
    areas: [...areaCounts].map(([area, users]) => ({ area, users, percent: percentage(users) }))
      .sort((a, b) => b.users - a.users || a.area.localeCompare(b.area, "it-IT")),
    // There is no explicit desired-sector field in the current schema or capture flow.
    sectors: { collected: false as const, knownUsers: 0, missingUsers: totalUsers },
  };
}

export type AdminPreferenceMetrics = ReturnType<typeof aggregateAdminPreferences>;
