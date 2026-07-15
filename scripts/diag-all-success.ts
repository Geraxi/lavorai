import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);

async function main() {
  const rows = await sql`
    SELECT a.id, a."submittedVia", a."submitConfirmation", a."completedAt",
           a."canaryLog", u.email AS user_email,
           j.title, j.company, j.source, j."recruiterEmail", j.url
    FROM "Application" a
    JOIN "User" u ON u.id = a."userId"
    LEFT JOIN "Job" j ON j.id = a."jobId"
    WHERE a.status = 'success'
    ORDER BY a."completedAt" DESC NULLS LAST
  ` as any[];

  console.log(`TOTALE success: ${rows.length}\n`);
  for (const r of rows) {
    console.log(`• ${r.user_email}  [${new Date(r.completedAt).toISOString().slice(0,16)}]`);
    console.log(`  "${(r.title||"").slice(0,55)}" @ ${r.company} (source=${r.source})`);
    console.log(`  submittedVia=${r.submittedVia}  submitConfirmation=${r.submitConfirmation}`);
    console.log(`  recruiterEmail=${r.recruiterEmail ?? "—"}`);
    console.log(`  url=${(r.url||"").slice(0,95)}`);
    if (r.canaryLog) console.log(`  canary=${r.canaryLog.slice(0,500)}`);
    console.log("");
  }
}
main().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
