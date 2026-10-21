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

const ENGINEER_WORDS = new Set(["engineer", "engineers", "developer", "developers", "dev", "devs", "sviluppatore", "sviluppatori", "sviluppatrice", "programmer", "programmers"]);

/** Prisma title filter for one token. A 2-letter acronym ("AI") must be a
 * whole word: a plain substring would match "Email", "Retail", "Maintenance". */
export function titleTokenWhere(tok: string): object {
  const low = tok.toLowerCase();
  // Developer = Dev = Engineer (role-match ENGINEER_SYNONYMS): query every form.
  if (ENGINEER_WORDS.has(low)) return { OR: [
    { title: { contains: "engineer", mode: "insensitive" as const } },
    { title: { contains: "developer", mode: "insensitive" as const } },
    { title: { contains: "sviluppat", mode: "insensitive" as const } },
    { title: { contains: "programmer", mode: "insensitive" as const } },
    wholeWord("dev"),
  ] };
  const compound = low.match(/^(full|front|back)[\s-]?(stack|end)$/);
  if (compound) return { OR: [`${compound[1]}${compound[2]}`, `${compound[1]}-${compound[2]}`, `${compound[1]} ${compound[2]}`]
    .map((v) => ({ title: { contains: v, mode: "insensitive" as const } })) };
  if (tok.length >= 3) return { title: { contains: tok, mode: "insensitive" as const } };
  return wholeWord(tok);
}

function wholeWord(tok: string) {
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
    const toks = [...new Set(role.replace(/\b(full|front|back)\s+(stack|end)\b/gi, "$1-$2").split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 3 || ACRONYMS.has(t.toLowerCase())))];
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
