import assert from "node:assert/strict";
import { quickMatchScore, skillVariants, splitRoles, canonicalRole } from "../src/lib/match-score";
import { roleTitleTokenGroups, titleTokenWhere } from "../src/lib/role-query";
import { titleMatchesRole } from "../src/lib/role-match";

// Synthetic profile with the same SHAPE as a rich real CV that scored 0-1/100:
// 29 skills (some with parentheses / ".js" / multi-word), a composite "·" title,
// 3 experience roles and a ~400-char summary. No real personal data.
const skills = [
  "LLM APIs (OpenAI + Anthropic)", "Cursor", "Lovable", "Bolt.new", "ElevenLabs", "HeyGen",
  "TypeScript", "JavaScript", "Python", "Swift", "SQL", "React", "React Native", "Expo",
  "Next.js", "SwiftUI", "Tailwind CSS", "Node.js", "Supabase", "Firebase", "REST APIs",
  "Auth0", "Git", "EAS Build", "Vercel", "VPS setup", "Figma", "Design systems", "App Store submission",
].map((name) => ({ name }));
const profile = {
  title: "Founding Engineer · Product Builder · Full-Stack Developer",
  summary: "Engineer who ships consumer products end to end: mobile apps with React Native and SwiftUI, web apps with Next.js and Supabase, and LLM automations for small businesses. Comfortable owning product, design and infrastructure, from the first prototype to App Store release, analytics and customer support. Looking for an early-stage startup where speed and ownership matter.",
  experiences: [
    { role: "Operations Manager" }, { role: "Founder & Automation Consultant" }, { role: "Indie Builder · Shipped Products" },
  ],
  skills,
} as never;

const fullstack = "Senior Fullstack Engineer\nAcme\nWe build our product with TypeScript, React and Next.js on Vercel, with Postgres (SQL) and Node.js services. You will ship features end to end, use Git daily and work closely with design in Figma.";
const mobile = "Senior React Native Developer\nBeta\nBuild our iOS and Android apps with React Native, Expo and TypeScript. Experience with Firebase, REST APIs and App Store submission is a plus.";
const sre = "Staff Site Reliability Engineer\nGamma\nOwn Kubernetes clusters, Terraform, Prometheus and on-call. Deep Linux, networking and AWS knowledge required.";
const unrelated = "Tax Accountant\nDelta\nPrepare tax returns, IFRS reporting, audits. CPA required.";

function testScaling() {
  const s = quickMatchScore(profile, fullstack);
  assert(s >= 55, `relevant full-stack job must clear a 40-55 threshold (got ${s})`);
  const m = quickMatchScore(profile, mobile);
  assert(m >= 55, `relevant mobile job scores high via skills + role synonyms (got ${m})`);
  // Same job text with a non-matching title: skills alone still give a real signal (not 0-1).
  const skillsOnly = quickMatchScore(profile, fullstack.replace("Senior Fullstack Engineer", "Product Engineer II"));
  assert(skillsOnly >= 40, `skills alone give a meaningful score (got ${skillsOnly})`);
  assert(quickMatchScore(profile, sre) < 20, "irrelevant SRE job stays low");
  assert(quickMatchScore(profile, unrelated) < 10, "unrelated job stays near zero");
  assert(skillsOnly > quickMatchScore(profile, sre), "ordering: relevant > irrelevant");
}

function testTokenization() {
  assert.deepEqual(skillVariants("Claude (API + Chat)"), ["claude"]);
  assert(skillVariants("Next.js").includes("nextjs"));
  assert.deepEqual(splitRoles("Founding Engineer · Product Builder · Full-Stack Developer"), ["founding engineer", "product builder", "full-stack developer"]);
  assert.equal(canonicalRole("full-stack developer"), "fullstack engineer");
  const goProfile = { title: "", summary: "", experiences: [], skills: [{ name: "Go" }, { name: "Git" }] } as never;
  assert.equal(quickMatchScore(goProfile, "Barista\nCafe\nA good attitude and digital menus."), 0, "no substring false positives (go/good, git/digital)");
  assert(quickMatchScore(goProfile, "Backend Engineer\nX\nWe write Go services and use Git.") > 50, "word-boundary hits still count");
  assert(quickMatchScore(profile, "Ingegnere\nX\nSviluppo app con Next.js e Node.js, React e TypeScript.") >= 30, "Italian description with the same tech still matches");
}

function testSentinels() {
  assert.equal(quickMatchScore(profile, ""), 100, "missing job text sentinel");
  assert.equal(quickMatchScore({ title: "", summary: "", experiences: [], skills: [] } as never, fullstack), 100, "empty profile sentinel");
  assert(quickMatchScore(profile, fullstack) <= 99, "real scores never collide with the 100 sentinel");
}

function testRoleQuery() {
  const roles = ["Full-Stack Developer", "Founding Engineer", "Machine Learning Engineer", "Product Engineer", "Mobile Developer", "React Native Developer", "iOS Engineer", "Senior iOS Engineer", "Machine Learning Engineer"];
  const groups = roleTitleTokenGroups(roles);
  const keys = groups.map((g) => g.join(" ").toLowerCase());
  assert(keys.includes("ios engineer"), "roles beyond the first 5 are queried");
  assert(keys.includes("react native developer"), "6th role is queried");
  assert(!keys.includes("senior ios engineer"), "superset of another role is redundant");
  assert.equal(keys.filter((k) => k === "machine learning engineer").length, 1, "duplicates merged");
  // "AI" is a meaningful acronym: "AI Engineer" must not collapse to "Engineer" (every engineering job).
  assert.deepEqual(roleTitleTokenGroups(["AI Engineer", "iOS Engineer"]).map((g) => g.join(" ")), ["AI Engineer", "iOS Engineer"]);
  assert.equal(titleMatchesRole("Software Engineer, Trust & Safety", "AI Engineer"), false, "AI Engineer is not any engineer");
  assert.equal(titleMatchesRole("Senior AI Engineer", "AI Engineer"), true);
  assert.equal(titleMatchesRole("Forward-Deployed AI Engineer - Internship", "AI Engineer"), true);
  assert.equal(titleMatchesRole("Email Marketing Engineer", "AI Engineer"), false, "acronym is a whole word");
  const aiWhere = JSON.stringify(titleTokenWhere("AI"));
  assert(!aiWhere.includes('"contains":"AI"'), "2-letter tokens are never a bare substring filter");
  assert.deepEqual(titleTokenWhere("Founding"), { title: { contains: "Founding", mode: "insensitive" } });
  // Developer = Dev = Engineer, in the DB query and in the title matcher.
  const engWhere = JSON.stringify(titleTokenWhere("Developer"));
  assert(engWhere.includes('"contains":"engineer"') && engWhere.includes('"contains":"developer"'), "Developer queries Engineer too");
  assert.deepEqual(titleTokenWhere("Engineer"), titleTokenWhere("Developer"));
  assert(!engWhere.includes('"contains":"dev"'), "Dev is a whole word, not a substring (DevOps)");
  assert(JSON.stringify(titleTokenWhere("Full-Stack")).includes('"contains":"fullstack"'));
  for (const [title, role, want] of [
    ["Fullstack Software Engineer (x/f/m) - Internal Agentic AI Platform", "Full-Stack Developer", true],
    ["Full-Stack Engineer - ElevenMusic", "Full-Stack Developer", true],
    ["Senior Full Stack Developer", "Full-Stack Engineer", true],
    ["Full-Stack Dev", "Full-Stack Engineer", true],
    ["Sviluppatore Full-Stack", "Full-Stack Developer", true],
    ["Founding Developer", "Founding Engineer", true],
    ["AI Developer", "AI Engineer", true],
    ["DevOps Engineer", "Full-Stack Developer", false],
    ["Engineering Manager, Full-Stack", "Full-Stack Developer", false],
    ["Full-Stack Designer", "Full-Stack Developer", false],
  ] as const) assert.equal(titleMatchesRole(title, role), want, `${title} ~ ${role}`);
  assert(roleTitleTokenGroups(Array.from({ length: 100 }, (_, i) => `Role${i} Engineer${i}`)).length <= 40, "bounded");
  assert.deepEqual(roleTitleTokenGroups(["  ", "x"]), [], "roles without significant tokens are ignored");
}

testScaling();
testTokenization();
testSentinels();
testRoleQuery();
console.log("match score: all tests passed");
