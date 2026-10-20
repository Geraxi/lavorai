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

const ACRONYMS = new Set(["ai", "ml", "ui", "ux", "qa", "bi", "ki", "ia", "ar", "vr"]);

/** Prisma title filter for one token. A 2-letter acronym ("AI") must be a
 * whole word: a plain substring would match "Email", "Retail", "Maintenance". */
export function titleTokenWhere(tok: string) {
  if (tok.length >= 3) return { title: { contains: tok, mode: "insensitive" as const } };
  const t = (v: object) => ({ title: { ...v, mode: "insensitive" as const } });
  return { OR: [
    t({ equals: tok }), t({ startsWith: `${tok} ` }), t({ startsWith: `${tok}-` }), t({ startsWith: `${tok}/` }),
    t({ contains: ` ${tok} ` }), t({ endsWith: ` ${tok}` }), t({ contains: ` ${tok},` }), t({ contains: ` ${tok}-` }),
    t({ contains: ` ${tok}/` }), t({ contains: `/${tok} ` }), t({ contains: `(${tok}` }), t({ contains: `-${tok} ` }),
  ] };
}

export function roleTitleTokenGroups(roles: string[], max = MAX_ROLE_GROUPS): string[][] {
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (const role of roles) {
    const toks = [...new Set(role.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 3 || ACRONYMS.has(t.toLowerCase())))];
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
