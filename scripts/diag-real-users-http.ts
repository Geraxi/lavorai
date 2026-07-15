import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);

const isTest = (e: string) =>
  e.toLowerCase() === "umbertogeraci0@gmail.com" ||
  /@(example\.com|test\.)/.test(e.toLowerCase()) ||
  e.toLowerCase().includes("+test") ||
  e.toLowerCase().includes("testmail.app") ||
  e.toLowerCase() === "demo@lavorai.it";

async function main() {
  const users = await sql`
    SELECT id, email, "createdAt", "emailVerified" FROM "User" ORDER BY "createdAt" ASC
  `;
  const apps = await sql`
    SELECT a."userId", a.status, a."submittedVia", a."createdAt", j.title, j.company
    FROM "Application" a LEFT JOIN "Job" j ON j.id = a."jobId"
  `;

  const byUser = new Map<string, any[]>();
  for (const a of apps as any[]) {
    if (!byUser.has(a.userId)) byUser.set(a.userId, []);
    byUser.get(a.userId)!.push(a);
  }

  console.log("=== UTENTI VERI (umani) ===\n");
  let realCount = 0, totalDelivered = 0;
  for (const u of users as any[]) {
    if (isTest(u.email)) continue;
    realCount++;
    const list = byUser.get(u.id) ?? [];
    const status: Record<string, number> = {};
    for (const a of list) status[a.status] = (status[a.status] ?? 0) + 1;
    const delivered = list.filter(a => a.status === "success" && a.submittedVia).length;
    totalDelivered += delivered;
    const verified = u.emailVerified ? "✓verificato" : "✗non-verif";
    console.log(`${u.email}  (${verified}, iscritto ${new Date(u.createdAt).toISOString().slice(0,10)})`);
    console.log(`   apps: ${list.length}  | inviate: ${delivered}  | stati: ${JSON.stringify(status)}`);
  }
  console.log(`\n>>> Utenti umani reali: ${realCount}`);
  console.log(`>>> Candidature realmente consegnate a utenti umani: ${totalDelivered}`);
}

main().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
