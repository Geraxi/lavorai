import assert from "node:assert/strict";
import { isJunkSessionTitle, searchRoleTitles } from "../src/lib/auto-apply-roles";
import { titleMatchesAnyRole, titleMatchesRole } from "../src/lib/role-match";
import { roleTitleTokenGroups, titleTokenWhere } from "../src/lib/role-query";

const s = (title: string, sentCount = 0, targetCount = 10) => ({ title, label: title, sentCount, targetCount });
// Real session titles seen on the owner account (Oct 2026).
const junk = ["Product", "Engineering", "Ai", "Ki", "Remote", "Generico", "Unknown", "Altro", "It Jobs", "People Team",
  "Business Development", "Security Compliance", "Enterprise Applications", "Office Of Cpo", "Product Management",
  "Product Operations", "Creative Design", "Web Ui Ux Design", "Core Devops", "Engineering Product And Design",
  "8569 Merchantxp - Pm", "8811 Product Design", "4900 Support Eng Pm", "2317 Marketing - Pmm", "8212 Ml Foundations",
  "8813 Web Presence Platform", "Product Designer · Design"];
for (const t of junk) assert.equal(isJunkSessionTitle(t), true, `junk: ${t}`);
for (const t of ["Product Designer", "Product Manager", "Full-Stack Developer", "AI Engineer", "Founding Engineer",
  "Senior Backend Engineer", "Head of Growth", "Sviluppatore Frontend"]) assert.equal(isJunkSessionTitle(t), false, `real: ${t}`);

const sessions = [s("Product"), s("Product Manager"), s("8569 Merchantxp - Pm"), s("Engineering")];
assert.deepEqual([...searchRoleTitles('["Full-Stack Developer","AI Engineer"]', sessions).values()],
  ["Full-Stack Developer", "AI Engineer"], "Saved roles are the only source when present; sessions are ignored");
assert.deepEqual([...searchRoleTitles("[]", sessions).values()], ["Product Manager"], "Empty rolesJson falls back to filtered session titles");
assert.deepEqual([...searchRoleTitles("not json", [s("Designer", 10, 10), s("UX Designer")]).values()], ["UX Designer"],
  "Malformed rolesJson falls back; full sessions are skipped");
assert.deepEqual([...searchRoleTitles('["  ", "ai engineer", "AI Engineer"]', []).values()], ["ai engineer"], "Blank and duplicate saved roles collapse");
assert.equal(titleMatchesRole("Software Engineer Intern – Fullstack", "Full-Stack Developer"), false);
assert.equal(titleMatchesAnyRole("Software Engineer Intern – Fullstack", ["Full-Stack Developer"]), false);
assert.equal(titleMatchesAnyRole("Stage Full-Stack Developer", ["Full-Stack Developer"]), false);
assert.equal(titleMatchesAnyRole("Tirocinio Full-Stack Developer", ["Full-Stack Developer"]), false);
assert.equal(titleMatchesAnyRole("Working Student – Full-Stack Developer", ["Full-Stack Developer"]), false);
assert.equal(titleMatchesAnyRole("Software Engineer Intern – Fullstack", ["Software Engineer Intern"]), true);
assert.equal(titleMatchesAnyRole("Senior Full-Stack Developer", ["Full-Stack Developer"]), true);
console.log("PASS auto-apply search roles: saved roles first, junk session titles filtered, internships excluded");

type TitleClause = {
  OR?: TitleClause[];
  title?: { equals?: string; startsWith?: string; endsWith?: string; contains?: string };
};
function satisfiesTitleClause(title: string, query: TitleClause): boolean {
  if (query.OR) return query.OR.some((q) => satisfiesTitleClause(title, q));
  const clause = query.title;
  if (!clause) return false;
  const value = title.toLowerCase();
  return (clause.equals !== undefined && value === clause.equals.toLowerCase())
    || (clause.startsWith !== undefined && value.startsWith(clause.startsWith.toLowerCase()))
    || (clause.endsWith !== undefined && value.endsWith(clause.endsWith.toLowerCase()))
    || (clause.contains !== undefined && value.includes(clause.contains.toLowerCase()));
}
const passesTitlePrefilter = (title: string, role: string) =>
  roleTitleTokenGroups([role]).some((group) =>
    group.every((token) => satisfiesTitleClause(title, titleTokenWhere(token))));

for (const [role, title] of [
  ["Senior Product Designer", "Product Designer"],
  ["Full Stack Engineer (AI)", "AI Fullstack Developer"],
  ["Product Designer / UX", "UX Product Designer"],
  ["Manager for Sales", "Sales Manager"],
  ["Software Engineer Intern", "Software Engineer Intern"],
  ["Stage", "Stage"],
]) {
  assert.equal(titleMatchesRole(title, role), true, `final title matcher: ${title} / ${role}`);
  assert.equal(passesTitlePrefilter(title, role), true, `DB title prefilter: ${title} / ${role}`);
}
assert.equal(titleMatchesRole("Software Engineer", "AI Engineer"), false, "a role-defining acronym still matters");
assert.equal(titleMatchesRole("Software Engineer Intern", "Senior Software Engineer"), false, "internship guard does not change");
assert.equal(passesTitlePrefilter("Marketing", "Marketing Intern"), false, "explicit internship search remains constrained");
console.log("PASS title query retains supported role matches while leaving final eligibility unchanged");
