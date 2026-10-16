import type { CVProfile } from "./cv-profile-types";
import { cleanHtmlText } from "./scrapers/html-clean";
export interface MatchExplanation { hasProfile: boolean; matchedSkills: string[]; missingEvidence: string[]; requirements: string[] }
const technologies = ["React", "TypeScript", "JavaScript", "Python", "SQL", "PostgreSQL", "Java", "Docker", "Kubernetes", "AWS", "Azure", "Figma", "Excel", "Salesforce", "SAP"];
const contains = (text: string, term: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
/** Quotes explicit requirements; missing CV evidence is never a claim of inability.
 * Does not use age, name, nationality, disability or other protected attributes. */
export function explainMatch(profile: CVProfile | null, description: string): MatchExplanation {
  const text = cleanHtmlText(description).replace(/\s+/g, " ").trim();
  const explicit = (line: string) => /\b(required|must|requirements?|requisiti?|richiest[oaie]|necessari[oaie]|obbligatori[oaie])\b/i.test(line) && !/\b(no (?:stated )?requirements?|nessun requisito|not required|not mandatory|optional|preferred|non richiest[oaie]|non necessari[oaie]|facoltativ[oaie]|preferenzial[ei])\b/i.test(line);
  const requirements = text.split(/(?<=[.!?;])\s+/).filter(explicit).slice(0, 3).map(line => line.slice(0, 260));
  const skills = profile?.skills.map(s => s.name.trim()).filter(Boolean) ?? [];
  const evidence = [profile?.title, profile?.summary, ...skills, ...(profile?.experiences ?? []).map(e => `${e.role} ${e.description} ${(e.bullets ?? []).join(" ")}`)].join(" ");
  return { hasProfile: !!profile, matchedSkills: skills.filter(s => contains(text, s)).slice(0, 8), requirements,
    missingEvidence: profile ? technologies.filter(skill => requirements.some(line => line.split(/[,;]|\band\b|\be\b/i).some(clause => explicit(clause) && contains(clause, skill))) && !contains(evidence, skill)).slice(0, 8) : [] };
}
