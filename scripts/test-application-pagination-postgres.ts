/** Disposable local PostgreSQL only. Uses synthetic records and the actual
 * before/after list implementation, never .env files or remote connections. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';
import { applicationIndexRevisionQuery } from '../src/lib/application-list-index';
import { listApplications } from '../src/lib/application-list';
import * as delivery from '../src/lib/application-delivery-view';
import * as pipeline from '../src/lib/application-pipeline';
import * as pagination from '../src/lib/application-pagination';
const pg='/opt/homebrew/opt/postgresql@16/bin';
const dir=mkdtempSync('/tmp/lavorai-pagination-');
const port=55449;
const url=`postgresql://postgres@127.0.0.1:${port}/pagination_test`;
const env:NodeJS.ProcessEnv={NODE_ENV:'test',LC_ALL:'C',LANG:'C',PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR};
const run=(bin:string,args:string[],input?:string)=>execFileSync(bin,args,{env,encoding:'utf8',input,stdio:['pipe','pipe','pipe']});
const sql=(input:string)=>run(join(pg,'psql'),[url,'-v','ON_ERROR_STOP=1','-At'],input);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let started=false;
const db=new PrismaClient({datasources:{db:{url}},log:[{emit:'event',level:'query'}]});
let queryCount=0;db.$on('query',()=>queryCount++);
const now=new Date('2026-10-15T12:00:00Z');
const baselineModule={exports:{} as any};
const baseline=run('git',['show','9b308d57a373e8662a52237ebdb48f54bd7efd38:src/lib/application-list.ts']);
vm.runInNewContext(ts.transpileModule(baseline,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:baselineModule,exports:baselineModule.exports,Buffer,Date,URLSearchParams,require:(id:string)=>({'./application-delivery-view':delivery,'./application-pipeline':pipeline,'./application-pagination':pagination}[id])});
const before=baselineModule.exports.listApplications;
let readDelay=0, evidenceReads=0, evidenceRows=0, fail=false;
const wrapped={
 $queryRaw:async (...args:any[])=>{if(fail)throw new Error('synthetic network failure');await sleep(readDelay);return (db.$queryRaw as any)(...args)},
 application:{
  findMany:async(q:any)=>{await sleep(readDelay);const rows=await db.application.findMany(q);if(!q.select.job){evidenceReads++;evidenceRows+=rows.length;}return rows},
  findFirst:async(q:any)=>{await sleep(readDelay);return db.application.findFirst(q)},
  count:async(q:any)=>{await sleep(readDelay);return db.application.count(q)},
 },
} as any;
const params=(query='')=>{const p=new URLSearchParams('includeAll=1&view=board');new URLSearchParams(query).forEach((v,k)=>p.set(k,v));return p;};
const request=(query='',owner='owner')=>listApplications(wrapped,owner,params(query),now) as Promise<any>;
const equal=async(query='')=>assert.deepEqual(JSON.parse(JSON.stringify(await request(query))),JSON.parse(JSON.stringify(await before(db,'owner',params(query),now))), 'Before/after parity: '+query);
async function main() {
try {
 run(join(pg,'initdb'),['-D',join(dir,'data'),'-U','postgres','-A','trust','--no-locale','-E','UTF8']);
 run(join(pg,'pg_ctl'),['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'-w','start']);started=true;
 run(join(pg,'createdb'),['-h','127.0.0.1','-p',String(port),'-U','postgres','pagination_test']);
 sql(`CREATE TABLE "Job" (id text PRIMARY KEY,title text,company text,location text,url text,source text);
 CREATE TABLE "Application" (id text PRIMARY KEY,"userId" text,"jobId" text,status text,portal text,"userStatus" text,"lastReplyKind" text,"submittedVia" text,"submitConfirmation" text,"submissionReceiptJson" text,"createdAt" timestamp,"errorMessage" text,"atsScore" int,"suggestionsJson" text,"completedAt" timestamp,"coverLetterText" text,"cvDocxPath" text,"coverLetterPath" text,"cvPdfPath" text,"cvLanguage" text,"viewedAt" timestamp,"submittedAt" timestamp,"lastReplyAt" timestamp,"replyCount" int DEFAULT 0);
 CREATE INDEX ON "Application" ("userId","createdAt");
 CREATE TABLE "ApplicationEmailAttempt" (id text PRIMARY KEY,"applicationId" text,"createdAt" timestamp,status text,"providerEmailId" text,"acceptedAt" timestamp,recipient text);
 CREATE INDEX ON "ApplicationEmailAttempt" ("applicationId","createdAt");`);
 const receipt=JSON.stringify({version:1,provider:'greenhouse',kind:'dom',capturedAt:now.toISOString(),jobId:'123',signal:'new_receipt_and_form_removed'});
 async function seed(n:number){
  sql(`TRUNCATE "Application", "Job", "ApplicationEmailAttempt";
   INSERT INTO "Job" SELECT 'job-'||i, 'Engineer '||i, CASE WHEN i%7=0 THEN 'Needle %_\\ company' ELSE 'Example' END, 'Milano','https://example.test/jobs/'||i,'test' FROM generate_series(0,${n-1}) i;
   INSERT INTO "Application" (id,"userId","jobId",status,portal,"userStatus","lastReplyKind","submittedVia","submissionReceiptJson","createdAt","coverLetterText")
    SELECT 'app-'||lpad(i::text,5,'0'),'owner','job-'||i,CASE WHEN i%11=0 THEN 'awaiting_consent' ELSE 'success' END,'greenhouse',CASE WHEN i%6=3 THEN 'colloquio' WHEN i%6=4 THEN 'offerta' END,CASE WHEN i%6=2 THEN 'risposta' END,CASE WHEN i%6=5 THEN 'manual' ELSE 'portal_greenhouse' END,CASE WHEN i%6=0 THEN '${receipt}' WHEN i%6=1 THEN '{malformed' END,'2026-10-15T12:00:00'::timestamp-(i/3)*interval '1 hour',repeat('Synthetic cover letter ',100) FROM generate_series(0,${n-1}) i;
   INSERT INTO "ApplicationEmailAttempt" SELECT 'email-'||i,'app-'||lpad(i::text,5,'0'),'2026-10-15'::timestamp, 'bounced','synthetic-'||i,null,'synthetic@example.test' FROM generate_series(0,${n-1}) i WHERE i%17=0;
   INSERT INTO "Application" (id,"userId","jobId",status,portal,"createdAt") VALUES ('foreign','other','job-0','success','test','2026-10-15'),('diagnostic','owner','job-0','diagnostic','test','2026-10-15'); ANALYZE;`);
 }
 await seed(723);
 for(const search of ['Needle','%','_','%_','\\','absent']) {
  const [revision]=await db.$queryRaw<Array<{total:number}>>(applicationIndexRevisionQuery({userId:'owner',since:null,search,includeAll:true}));
  const count=await db.application.count({where:{userId:'owner',status:{not:'diagnostic'},job:{OR:['title','company','location'].map(field=>({[field]:{contains:search,mode:'insensitive'}}))}}});
  assert.equal(revision.total,count,'Fingerprint and Prisma must match the same rows: '+search);
 }

 for(const q of ['', 'attentionPage=2','recordedPage=9999','conversationPage=4&outcomePage=3','view=table&page=2','view=attention&page=2','range=today','range=week','range=month','includeAll=0','search=Needle','search=%_','search=\\','search=absent','lane=recorded','lane=attention','id=app-00700','id=foreign','id=diagnostic']) await equal(q);
 for(const lane of pagination.APPLICATION_LANES){
  const first=await request('lane='+lane);const seen:string[]=[];
  for(let p=1;p<=first.lanes[lane].pageCount;p++)seen.push(...(await request(`lane=${lane}&${lane}Page=${p}`)).applications.map((a:any)=>a.id));
  assert.equal(seen.length,first.lanes[lane].total);assert.equal(new Set(seen).size,seen.length);
 }
 await listApplications(wrapped,'owner',params('range=week'),new Date(now.getTime()+1000));evidenceReads=0;
 await listApplications(wrapped,'owner',params('range=week&attentionPage=2'),new Date(now.getTime()+2000));
 assert.equal(evidenceReads,0,'Rolling time ranges reuse the index when membership is unchanged');
 assert.equal((await request('', 'other')).total,1);
 const changes=[
  `UPDATE "Application" SET "userStatus"='offerta' WHERE id='app-00700'`,
  `UPDATE "Application" SET "lastReplyKind"='colloquio' WHERE id='app-00701'`,
  `UPDATE "Application" SET "submissionReceiptJson"='${receipt}' WHERE id='app-00702'`,
  `UPDATE "ApplicationEmailAttempt" SET status='delivered' WHERE id='email-0'`,
  `INSERT INTO "ApplicationEmailAttempt" VALUES ('new-email','app-00000','2026-10-16','bounced','provider-new',null,'synthetic@example.test')`,
  `DELETE FROM "ApplicationEmailAttempt" WHERE id='new-email'`,
  `UPDATE "Application" SET "submitConfirmation"='MANUAL',"submittedVia"=null WHERE id='app-00701'`,
  `UPDATE "Application" SET status='diagnostic' WHERE id='app-00700'`,
  `DELETE FROM "Application" WHERE id='app-00699'`,
  `UPDATE "Job" SET title='Needle renamed',company='Changed',location='Needle City' WHERE id='job-1'`,
 ];
 for(const change of changes){sql(change);await equal();await equal('search=Needle');}
 fail=true;await assert.rejects(request(),/network failure/);fail=false;await equal();
 // Same cache miss shared by concurrent page requests; no rejected promise retained.
 sql(`UPDATE "Application" SET "userStatus"='rifiutata' WHERE id='app-00698'`);
 evidenceReads=0;await Promise.all([request(),request('attentionPage=2'),request('recordedPage=2')]);assert.equal(evidenceReads,2);
 const timings:any[]=[];
 for(const n of [723,3258]){
  await seed(n);
  for(const delay of [0,50]){
   readDelay=delay;
   // A new client facade simulates a new server instance for every cold sample.
   for(const kind of ['before','after-cold','after-warm']){
    const samples:any[]=[];
    for(let i=0;i<5;i++){
     const client={...wrapped};
     if(kind==='after-warm')await listApplications(client,'owner',params(),now);
     queryCount=0;evidenceReads=0;evidenceRows=0;const start=performance.now();
     const result=await (kind==='before'?before:listApplications)(client,'owner',params('attentionPage=2&recordedPage=2'),now);
     assert.equal(result.total,n);samples.push({ms:Math.round((performance.now()-start)*10)/10,sqlQueries:queryCount,evidenceReads,evidenceRows});
    }
    const ms=samples.map(s=>s.ms).sort((a,b)=>a-b);timings.push({records:n,readDelayMs:delay,kind,medianMs:ms[2],minMs:ms[0],maxMs:ms[4],samples});
   }
  }
 }
 readDelay=0;
 mkdirSync('output/verification',{recursive:true});writeFileSync('output/verification/pagination-performance.json',JSON.stringify({setup:'Mac, disposable PostgreSQL 16, synthetic data; delay per Prisma operation (not per wire packet); 5 samples; no HTTP/auth/browser time',timings},null,2));
 console.log(JSON.stringify(timings.map(({samples,...r})=>r),null,2));
 console.log('PASS actual PostgreSQL: 723+ records, all stage pages, owner isolation, Prisma-compatible wildcard/escape filters and ranges, evidence parity and live invalidation, latest email change/deletion, inserts/deletions, failure recovery, concurrent cache fill; before/after at 723 and 3258.');
} catch(error) { try { console.error(readFileSync(join(dir,'postgres.log'),'utf8')); } catch {} throw error; } finally {await db.$disconnect();if(started)run(join(pg,'pg_ctl'),['-D',join(dir,'data'),'-m','fast','-w','stop']);rmSync(dir,{recursive:true,force:true});}

}
main().catch(error=>{console.error(error);process.exitCode=1});
