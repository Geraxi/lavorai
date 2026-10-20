import assert from "node:assert/strict";
import { isJunkSessionTitle, searchRoleTitles } from "../src/lib/auto-apply-roles";

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
console.log("PASS auto-apply search roles: saved roles first, junk session titles filtered");
