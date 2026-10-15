/** Applies the additive release and attention migrations to the live schema in a new local DB.
 * No .env files, remote databases or real providers are used. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
const pg='/opt/homebrew/opt/postgresql@16/bin';
const port=55438;
const probe=createServer();
await new Promise((yes,no)=>{probe.once('error',no);probe.listen(port,'127.0.0.1',yes)});
await new Promise(yes=>probe.close(yes));
const dir=await mkdtemp(join(tmpdir(),'lavorai-integrated-'));
const url=`postgresql://postgres@127.0.0.1:${port}/inbox_replies_test`;
const env={...process.env,DATABASE_URL:url,DIRECT_URL:url};
const run=(binary,args,options={})=>execFileSync(binary,args,{env,encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
const sql=input=>run(join(pg,'psql'),[url,'-v','ON_ERROR_STOP=1','-At'],{input});
let started=false;
try {
 run(join(pg,'initdb'),['-D',join(dir,'data'),'-U','postgres','-A','trust','--no-locale','-E','UTF8']);
 run(join(pg,'pg_ctl'),['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'-w','start']);started=true;
 run(join(pg,'createdb'),['-h','127.0.0.1','-p',String(port),'-U','postgres','inbox_replies_test']);
 const baseline=run('git',['show','977c766f0f99ae57944b99ac3adee34be66cb6e8:prisma/schema.prisma']);
 await writeFile(join(dir,'baseline.prisma'),baseline);
 sql(run(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','diff','--from-empty','--to-schema-datamodel',join(dir,'baseline.prisma'),'--script']));
 sql(`INSERT INTO "User" (id,email) VALUES ('migration-owner','migration@example.test'); INSERT INTO "Job" (id,"externalId",title,company,url,source,description) VALUES ('migration-job','migration-fixture','Engineer','Example','https://example.test','test','Synthetic'); INSERT INTO "Application" (id,"userId","jobId",portal) VALUES ('migration-app','migration-owner','migration-job','test'); INSERT INTO "ApplicationReply" (id,"applicationId","fromAddress",subject,"bodyText",kind) VALUES ('migration-reply','migration-app','old@example.test','Existing reply','Keep this text','risposta');`);
 const before=sql('SELECT row_to_json(t)::text FROM "User" t WHERE id=\'migration-owner\';');
 for(const file of ['20261015120000_feedback_reports','20261015220000_inbox_user_replies','20261016090000_attention_and_job_dismissals']) sql(await readFile(`prisma/migrations/${file}/migration.sql`,'utf8'));
 assert.equal(sql('SELECT row_to_json(t)::text FROM "User" t WHERE id=\'migration-owner\';'),before);
 assert.equal(sql('SELECT "bodyText" || \'|\' || "directRecipient"::text FROM "ApplicationReply" WHERE id=\'migration-reply\';').trim(),'Keep this text|false');
 const diff=run(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','diff','--from-url',url,'--to-schema-datamodel','prisma/schema.prisma','--exit-code']);
 assert.match(diff,/No difference detected/);
 console.log('PASS: all three exact additive migrations on populated canonical live schema; user/application/reply preserved; resulting schema matches integrated Prisma.');
 console.log(run(process.execPath,['--import','tsx','scripts/test-inbox-replies-postgres.ts']));
} finally {if(started)run(join(pg,'pg_ctl'),['-D',join(dir,'data'),'-m','fast','-w','stop']);await rm(dir,{recursive:true,force:true})}
