import { prisma } from "../src/lib/db";
import { rowToProfile } from "../src/lib/cv-profile-types";

async function main() {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: "umbertogeraci0@gmail.com" },
    include: { preferences: true, cvProfile: true },
  });

  let prefRoles: string[] = [];
  try {
    prefRoles = JSON.parse(u.preferences?.rolesJson ?? "[]");
  } catch {
    /* */
  }
  console.log("=== User preferences (selezionati) ===");
  console.log("roles:", prefRoles);
  console.log("title profile:", u.preferences ? "(via session)" : "n/a");
  console.log("");

  if (u.cvProfile) {
    const p = rowToProfile(u.cvProfile);
    console.log("=== Profile CV ===");
    console.log("title:", p.title || "(empty)");
    console.log("summary:", (p.summary ?? "").slice(0, 100));
    console.log("\nexperiences (role):");
    for (const e of p.experiences ?? []) {
      console.log(`  - ${e.role} @ ${e.company}`);
    }
  }

  console.log("\n=== Sessioni attive ===");
  const sessions = await prisma.applicationSession.findMany({
    where: { userId: u.id, status: { in: ["active", "auto", "paused"] } },
    select: { title: true, label: true, status: true, sentCount: true, targetCount: true },
  });
  for (const s of sessions) {
    console.log(`  ${s.title ?? s.label} · ${s.status} · ${s.sentCount}/${s.targetCount}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
