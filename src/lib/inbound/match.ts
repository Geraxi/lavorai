/** Match an inbound email to one of the user's applications by company / job title. Pure. */
export interface MatchCandidate { id: string; company: string | null; title: string; url?: string | null; at: Date | null }

const STOP = new Set(["srl", "spa", "s.r.l", "s.p.a", "inc", "ltd", "llc", "gmbh", "group", "gruppo", "italia", "italy", "the", "company", "team", "careers", "jobs", "hr"]);
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function companyTokens(company: string): string[] {
  return norm(company).split(" ").filter((t) => t.length >= 3 && !STOP.has(t));
}

export function scoreCandidate(c: MatchCandidate, mail: { from: string; subject: string; body: string }): number {
  if (!c.company?.trim()) return 0;
  const text = ` ${norm(`${mail.subject}\n${mail.body.slice(0, 6000)}`)} `;
  const fromDomain = norm(mail.from.match(/@([^>\s]+)/)?.[1] ?? "");
  const full = norm(c.company);
  const tokens = companyTokens(c.company);
  let score = 0;
  if (full && text.includes(` ${full} `)) score += 3;
  else if (tokens.length && tokens.every((t) => text.includes(` ${t} `))) score += 2;
  if (tokens.some((t) => fromDomain.split(" ").includes(t))) score += 2;
  if (score === 0) return 0; // company evidence is mandatory
  const title = norm(c.title);
  if (title && text.includes(` ${title} `)) score += 3;
  else {
    const words = title.split(" ").filter((w) => w.length >= 4);
    if (words.length && words.filter((w) => text.includes(` ${w} `)).length / words.length >= 0.6) score += 1;
  }
  return score;
}

/** Unique best match or null (ties are ambiguous → no match). */
export function bestApplicationMatch(cands: MatchCandidate[], mail: { from: string; subject: string; body: string }): string | null {
  const scored = cands.map((c) => ({ c, s: scoreCandidate(c, mail) })).filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s || (b.c.at?.getTime() ?? 0) - (a.c.at?.getTime() ?? 0));
  if (!scored.length) return null;
  if (scored.length > 1 && scored[1].s === scored[0].s) {
    // Same company + same score: only accept when it's literally one job (same title).
    const same = scored.filter((x) => x.s === scored[0].s);
    if (new Set(same.map((x) => norm(x.c.title))).size > 1) return null;
  }
  return scored[0].c.id;
}
