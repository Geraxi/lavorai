import type { CVProfile } from "@/lib/cv-profile-types";
import { titleMatchesRole } from "@/lib/role-match";

/**
 * Quick match score tra profilo utente e un job posting. 0-99 (100 = input
 * mancante, sentinella usata da discover-match-score).
 *
 * Perché è stata riscritta (ott 2026): la formula precedente usava come
 * denominatore del recall TUTTI i termini del profilo — skill + ~50 bigrammi
 * del summary + titolo/ruoli come frasi intere. Un CV ricco (29 skill, summary
 * di 400 caratteri) aveva ~80 termini: anche un job perfetto ne toccava 5-8,
 * quindi 0-5/100. Inoltre:
 *  - il titolo composito ("Founding Engineer · Full-Stack Developer") era un
 *    unico ruolo che non matchava mai il titolo di un job;
 *  - skill come "Claude (API + Chat)" o "Next.js" non venivano trovate
 *    ("claude", "nextjs");
 *  - il match per substring dava falsi positivi ("Go" in "good", "Git" in
 *    "digital").
 *
 * Nuova formula:
 *  - skillCoverage = skill trovate (a confine di parola, con varianti) /
 *    min(#skill, SKILL_TARGET). Un job menziona tipicamente 5-10 tecnologie:
 *    trovarne SKILL_TARGET significa copertura piena. Peso 75.
 *  - summaryCoverage = parole chiave del summary presenti nel job /
 *    min(#parole, SUMMARY_TARGET). Peso 10 (segnale debole).
 *  - Boost ruolo: se il TITOLO del job contiene uno dei ruoli del profilo
 *    (titolo CV e ruoli delle esperienze, separati su "·", "|", "/", ",")
 *    → almeno 55, +15.
 */
const SKILL_TARGET = 8;
const SUMMARY_TARGET = 12;

export function quickMatchScore(
  profile: Pick<CVProfile, "skills" | "experiences" | "title" | "summary">,
  jobText: string,
): number {
  const raw = jobText ?? "";
  if (!raw.trim()) return 100;
  const job = normalize(raw);

  const skillGroups: string[][] = [];
  const seenSkill = new Set<string>();
  for (const s of profile.skills ?? []) {
    const variants = skillVariants(s?.name ?? "");
    const key = variants[0];
    if (!key || seenSkill.has(key)) continue;
    seenSkill.add(key);
    skillGroups.push(variants);
  }

  const roles = new Set<string>();
  for (const r of splitRoles(profile.title)) roles.add(r);
  for (const e of profile.experiences ?? []) for (const r of splitRoles(e?.role)) roles.add(r);

  const summaryWords = [...new Set(
    normalize(profile.summary ?? "")
      .split(/[^\p{L}\p{N}+#.-]+/u)
      .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  )];

  if (skillGroups.length === 0 && roles.size === 0 && summaryWords.length === 0) return 100;

  let skillHits = 0;
  for (const variants of skillGroups) if (variants.some((v) => containsTerm(job, v))) skillHits++;
  const skillCoverage = skillGroups.length ? Math.min(1, skillHits / Math.min(skillGroups.length, SKILL_TARGET)) : 0;

  let summaryHits = 0;
  for (const w of summaryWords) if (containsTerm(job, w)) summaryHits++;
  const summaryCoverage = summaryWords.length ? Math.min(1, summaryHits / Math.min(summaryWords.length, SUMMARY_TARGET)) : 0;

  // Senza skill nel profilo il peso delle skill passa al summary.
  let score = skillGroups.length ? skillCoverage * 75 + summaryCoverage * 10 : summaryCoverage * 60;

  const jobTitle = canonicalRole(normalize(raw.split("\n")[0] ?? ""));
  const jobHead = canonicalRole(job.slice(0, 160));
  for (const role of roles) {
    const r = canonicalRole(role);
    if (r.length >= 4 && (containsTerm(jobHead, r) || titleMatchesRole(jobTitle, r))) {
      score = Math.max(score, 55) + 15;
      break;
    }
  }

  return Math.round(Math.min(99, Math.max(0, score)));
}

/** Sinonimi frequenti nei titoli: "Full-Stack Developer" ≈ "Fullstack Engineer". */
export function canonicalRole(s: string): string {
  return s
    .replace(/\bfull[\s-]?stack\b/g, "fullstack")
    .replace(/\bfront[\s-]?end\b/g, "frontend")
    .replace(/\bback[\s-]?end\b/g, "backend")
    .replace(/\b(?:developer|sviluppatore|sviluppatrice|programmer|programmatore)\b/g, "engineer");
}

function normalize(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Ruoli da un titolo composito: "Founding Engineer · Full-Stack Developer". */
export function splitRoles(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return normalize(raw)
    .split(/\s*(?:[·•|/,;]|\s-\s|\s–\s)\s*/)
    .map((r) => r.replace(/\s+/g, " ").trim())
    .filter((r) => r.length >= 4);
}

/** Varianti di una skill: "Claude (API + Chat)" → ["claude"], "Next.js" → ["next.js","nextjs"]. */
export function skillVariants(name: string): string[] {
  const base = normalize(name).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (base.length < 1) return [];
  const out = new Set<string>([base]);
  if (/\.js$/.test(base)) { out.add(base.replace(/\.js$/, "js")); out.add(base.replace(/\.js$/, " js")); }
  if (base.includes("-")) out.add(base.replace(/-/g, " "));
  if (/ apis?$/.test(base)) out.add(base.replace(/ apis?$/, " api"));
  return [...out];
}

const termCache = new Map<string, RegExp>();
/** Match a confine di parola (lettere/cifre), così "go" non matcha "good". */
function containsTerm(text: string, term: string): boolean {
  if (!term) return false;
  let re = termCache.get(term);
  if (!re) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
    re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "u");
    if (termCache.size > 5000) termCache.clear();
    termCache.set(term, re);
  }
  return re.test(text);
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "are", "our", "that", "this", "will",
  "have", "has", "from", "your", "can", "any", "all", "who", "what", "when",
  "how", "why", "per", "con", "una", "uno", "gli", "nel", "nella", "dei",
  "delle", "degli", "anche", "come", "alla", "dalla", "dello", "della",
  "team", "work", "role", "job", "company", "azienda", "lavoro", "ruolo",
  "years", "anni", "esperienza", "experience", "over", "more", "into", "than",
  "sono", "molto", "oltre", "their", "they", "them", "also", "about", "where",
  "which", "while", "quando", "dove", "questo", "questa", "tutti", "ogni",
  "building", "built", "build", "using", "based", "across", "through",
]);
