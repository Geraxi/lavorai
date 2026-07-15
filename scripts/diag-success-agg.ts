import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);
async function main() {
  const rows = await sql`SELECT a."submittedVia", a."submitConfirmation", j."recruiterEmail" FROM "Application" a LEFT JOIN "Job" j ON j.id=a."jobId" WHERE a.status='success'` as any[];
  const via: Record<string,number> = {}; const conf: Record<string,number> = {};
  let emailWithNoRec=0, emailTot=0;
  for (const r of rows){
    via[r.submittedVia??'null']=(via[r.submittedVia??'null']??0)+1;
    conf[r.submitConfirmation??'null']=(conf[r.submitConfirmation??'null']??0)+1;
    if(r.submittedVia==='email_recruiter'){emailTot++; if(!r.recruiterEmail) emailWithNoRec++;}
  }
  console.log('per submittedVia:', via);
  console.log('per submitConfirmation:', conf);
  console.log(`email_recruiter totali: ${emailTot}, di cui SENZA recruiterEmail salvata sul job: ${emailWithNoRec}`);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
