import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);

async function main() {
  const rows = await sql`
    SELECT a.id, a.status, a."submittedVia", a."submitConfirmation",
           a."completedAt", a."createdAt", a."errorMessage",
           LEFT(a."canaryLog", 400) AS canary,
           u.email AS user_email,
           j.title, j.company, j.source, j."recruiterEmail", LEFT(j.url, 90) AS url
    FROM "Application" a
    JOIN "User" u ON u.id = a."userId"
    LEFT JOIN "Job" j ON j.id = a."jobId"
    WHERE a.status IN ('success','ready_to_apply','needs_answers','failed')
    ORDER BY a."createdAt" DESC
    LIMIT 20
  ` as any[];

  for (const r of rows) {
    console.log(`\n———————————————————————————`);
    console.log(`${new Date(r.createdAt).toISOString().slice(0,16)}  [${r.status}]  ${r.user_email}`);
    console.log(`  job: "${(r.title||"").slice(0,50)}" @ ${r.company}  (source=${r.source})`);
    console.log(`  submittedVia=${r.submittedVia ?? "—"}   submitConfirmation=${r.submitConfirmation ?? "—"}`);
    console.log(`  recruiterEmail=${r.recruiterEmail ?? "—"}`);
    console.log(`  url=${r.url}`);
    if (r.errorMessage) console.log(`  errorMessage: ${r.errorMessage.slice(0,160)}`);
    if (r.canary) console.log(`  canary: ${r.canary}`);
  }

  // Riepilogo: cosa abbiamo dichiarato "success" e con quale prova
  const succ = rows.filter(r => r.status === "success");
  console.log(`\n\n=== SUCCESS (${succ.length}) — distribuzione prova ===`);
  const byConf: Record<string, number> = {};
  for (const r of succ) {
    const k = `via=${r.submittedVia ?? "null"} · conf=${r.submitConfirmation ?? "null"}`;
    byConf[k] = (byConf[k] ?? 0) + 1;
  }
  for (const [k,v] of Object.entries(byConf)) console.log(`  ${v} × ${k}`);
}

main().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
