/**
 * Token sets for the auto-apply job query: one AND-group of title tokens per
 * role (OR across roles). Before, only the first 5 roles were queried, so a
 * user with 37 roles (sessions + preferences) never saw jobs for the other 32.
 *
 * Efficiency: roles with identical token sets are merged, and a role whose
 * tokens are a superset of another role's is dropped (the smaller set already
 * matches every title the larger one would). Capped at MAX_ROLE_GROUPS.
 */
export const MAX_ROLE_GROUPS = 40;

export function roleTitleTokenGroups(roles: string[], max = MAX_ROLE_GROUPS): string[][] {
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (const role of roles) {
    const toks = [...new Set(role.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 3))];
    if (!toks.length) continue;
    const key = toks.map((t) => t.toLowerCase()).sort().join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push(toks);
  }
  const lower = groups.map((g) => new Set(g.map((t) => t.toLowerCase())));
  const kept = groups.filter((g, i) => !lower.some((other, j) => j !== i && other.size < lower[i].size && [...other].every((t) => lower[i].has(t))));
  return kept.slice(0, max);
}
