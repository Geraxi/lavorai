/** Ordinary worker, real gates/transactions/adapter/documents; fake AI + local HTTPS only. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { startFakeRecruiteeServer, installFakeRecruiteeFetch } from './fake-recruitee-server';

async function main() {
  const url = new URL(process.env.ORDINARY_TEST_DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.pathname, /^\/lavorai_ordinary_test$/);
  process.env.DATABASE_URL = url.href; process.env.DIRECT_URL = url.href;
  Object.assign(process.env, { NODE_ENV: 'test', APPLICATIONS_PAUSED: 'false', APPLICATION_SENDING_MODE: 'automatic',
    USER_NOTIFICATIONS_HOLD: 'true', APPLY_GLOBAL_DAILY_CAP: '100', AUTO_APPLY_ENABLED: 'true' });
  for (const key of ['ATS_TEST_REAL_SUBMIT','ATS_TEST_USER_ID','ATS_TEST_DESTINATIONS','ATS_TEST_CANDIDATE_EMAIL',
    'RESEND_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','BLOB_READ_WRITE_TOKEN','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
    'INBOUND_EMAIL_DOMAIN','INBOUND_ROUTE_ATS_EMAIL','PORTAL_SUBMIT_DRY_RUN']) delete process.env[key];
  const req = createRequire(resolve('src/lib/application-worker.ts'));
  const { prisma: db } = req('./db');
  const existing = await db.$queryRawUnsafe("SELECT count(*) FROM pg_tables WHERE schemaname='public'");
  assert.equal(Number(existing[0].count), 0, 'refuse nonempty database');
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'),'db','push','--skip-generate'], {stdio:'inherit',env:process.env});
  // Replace db-push projections with the actual additive migration, including SQL CHECKs.
  await db.$executeRawUnsafe('DROP TABLE "ApplicationReleaseGrant"');
  await db.$executeRawUnsafe('DROP TABLE "ApplicationReleaseBatch"');
  const releaseSql=readFileSync('prisma/migrations/20261025020000_application_release_budget/migration.sql','utf8');
  for(const sql of releaseSql.split(/;\s*(?:\n|$)/).filter(s=>s.trim()))await db.$executeRawUnsafe(sql);
  await assert.rejects(()=>db.applicationReleaseBatch.create({data:{id:'invalid-cap',maxCount:6}}));
  await assert.rejects(()=>db.applicationReleaseBatch.create({data:{id:'invalid-used',maxCount:1,usedCount:2}}));
  await assert.rejects(()=>db.applicationReleaseBatch.create({data:{id:'invalid-negative',maxCount:1,usedCount:-1}}));
  await assert.rejects(()=>db.applicationReleaseGrant.create({data:{applicationId:'no-parent',batchId:'missing'}}));
  const readiness=req('./customer-rollout-readiness');
  const metadata=await readiness.readReleaseSchema({$queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>{
    assert.equal(values.length,0,'catalog SQL has no dynamic input');
    const result=await db.$queryRaw(strings,...values);
    if(result.length){
      const types=await db.$queryRawUnsafe('SELECT pg_typeof(q."table")::text AS kind FROM ('+strings.join('')+') q LIMIT 1');
      assert.equal(types[0].kind,'text','projected catalog identifiers must not use PostgreSQL name OID 19');
      if('name' in result[0]){const names=await db.$queryRawUnsafe('SELECT pg_typeof(q.name)::text AS kind FROM ('+strings.join('')+') q LIMIT 1');assert.equal(names[0].kind,'text');}
    }
    return result;
  }});assert.deepEqual(metadata.issues,[],'actual release migration constraints must be recognized');
  assert.equal(readiness.assessReleaseSchema(metadata.columns,metadata.constraints.filter((c:any)=>c.name!=='ApplicationReleaseBatch_used_le_max'),metadata.indexes).compatible,false,'missing SQL CHECK must not pass readiness');
  assert.equal(readiness.assessReleaseSchema(metadata.columns,metadata.constraints,[]).compatible,false,'missing grant index must not pass readiness');
  let aiCalls = 0;
  // Replace only AI provider boundaries, not worker gates or adapter decisions.
  function fakeModule(path: string, exports: object) {
    const id = req.resolve(path); req.cache[id] = {id, filename:id, loaded:true, exports} as any;
  }
  fakeModule('./claude', { optimizeCV: async ({cvText}: {cvText:string}) => {
    aiCalls++; assert.match(cvText, /Synthetic ordinary/);
    return {optimizedCV:{fullName:'Synthetic Ordinary',targetRole:'Engineer',email:'synthetic@example.test',phone:'+390212345678',location:'Milano',summary:'Synthetic ordinary engineer',experiences:[],education:[],skills:{technical:['TypeScript'],soft:[],tools:[]},languages:[]},coverLetter:'Synthetic ordinary application',atsScore:90,suggestions:[]};
  }});
  fakeModule('./cv-profile-ai-full', { tailorProfileForJob: async ({profile}: any)=>profile, extractFullProfile: async ()=>{throw new Error('fixture profile expected');} });
  const fake = await startFakeRecruiteeServer();
  const forbidden: string[]=[];
  const restore = installFakeRecruiteeFetch({port:fake.port,ca:fake.ca,onForbidden:u=>forbidden.push(u)});
  const mails: any[]=[];
  let mailMode="accept";
  process.env.RESEND_API_KEY='re_local_fake_only';
  fakeModule('resend', { Resend: class { emails={send:async (payload:any)=>{mails.push(payload);return mailMode==="error" ? {data:null,error:{message:"synthetic failure"}} : mailMode==="no_id" ? {data:{},error:null} : {data:{id:`local-mail-${mails.length}`},error:null};}}; } });
  let unreadableAttachment = false;
  const storage = req('./storage');
  fakeModule('./storage', { ...storage, saveUserFile: async (...args: any[]) => {
    const path = await storage.saveUserFile(...args);
    return unreadableAttachment && String(args[2]).startsWith('CV') ? '/nonexistent/ordinary-synthetic-cv.docx' : path;
  }});
  const {processApplication: run} = req('./application-worker');
  const {applicationDeliveryView: view}=req('./application-delivery-view');
  const posts = ()=>fake.requests.filter(r=>r.method==='POST' && r.path.endsWith('/candidates')).length;
  const adapter=req('./ats-adapter-resolution').resolveAdapterByUrl(['https://fake-lavorai.recruitee.com/o/real-optional']).adapter;
  const originalApply=adapter.apply;
  let wrongReceipt=false;
  adapter.apply=async (...args:any[])=>{
    const result=await originalApply(...args);
    if(wrongReceipt && result.receipt) result.receipt={...result.receipt,jobId:'different-offer'};
    return result;
  };
  let seq=0;
  async function fixture(slug='real-optional', userChanges: any={}, text='Synthetic ordinary engineer with TypeScript skills') {
    const id=`ordinary-${++seq}`; const now=new Date();
    const user=await db.user.create({data:{id,email:`${id}@example.test`,name:'Synthetic Ordinary',tier:'pro',subscriptionStatus:'active',currentPeriodEnd:new Date(+now+86400000),emailVerified:now,privacyConsentAt:now,...userChanges,
      preferences:{create:{autoApplyMode:'auto',rolesJson:'["Engineer"]',locationsJson:'["Milano"]',matchMin:0,employmentType:'both',salaryMin:0}},
      cvProfile:{create:{firstName:'Synthetic',lastName:'Ordinary',email:`${id}@example.test`,phone:'+390212345678',city:'Milano',title:'Engineer',summary:'Synthetic ordinary engineer',skillsJson:'["TypeScript"]'}},
      cvDocuments:{create:{originalFilename:'synthetic.txt',storagePath:'fixture-only',extractedText:text}}}});
    const job=await db.job.create({data:{externalId:id,source:'recruitee',title:'Engineer',company:'Synthetic',description:'Engineer TypeScript',location:'Milano',url:`https://fake-lavorai.recruitee.com/o/${slug}`}});
    await db.application.create({data:{id,userId:user.id,jobId:job.id,portal:'recruitee'}});
    return id;
  }
  try {
    const {durableBrowserFence}=req('./local-workspace/durable-browser-fence');
    const fence=durableBrowserFence({enabled:true,databaseUrl:url.href});
    const browserId=await fixture('durable-browser');
    await assert.rejects(fence.reserve(browserId,'wrong-owner'),/unavailable/);
    const reservations=await Promise.all([fence.reserve(browserId,browserId),fence.reserve(browserId,browserId)]);
    const lease=reservations.find(Boolean);assert.ok(lease);assert.equal(reservations.filter(Boolean).length,1);
    const {loadDatabaseBrowserInput}=req('./local-workspace/database-browser-input');
    const pdf=Buffer.from('%PDF-synthetic owned reader fixture');
    const document=await db.cVDocument.create({data:{userId:browserId,originalFilename:'synthetic.pdf',extractedText:'Synthetic fixture only',storagePath:'data:application/pdf;base64,'+pdf.toString('base64')}});
    const request={applicationId:browserId,documentId:document.id,leaseToken:lease.leaseToken,expectedDocumentHash:require('node:crypto').createHash('sha256').update(pdf).digest('hex')};
    await assert.rejects(loadDatabaseBrowserInput(db,browserId,request),/disabled/);
    await assert.rejects(loadDatabaseBrowserInput(db,null,request,true),/disabled/);
    await assert.rejects(loadDatabaseBrowserInput(db,'other-owner',request,true),/lease/);
    const ownedInput=await loadDatabaseBrowserInput(db,browserId,request,true);
    assert.equal(ownedInput.snapshot.owner,browserId);assert.deepEqual(ownedInput.document.bytes,pdf);
    console.log('PASS actual Prisma ownership queries + existing inline-PDF storage reader; synthetic records only');
    assert.equal(await fence.beforeData(browserId,browserId,lease,'portal_recruitee'),true);
    const clicks=await Promise.all([fence.beforeSubmit(browserId,browserId,lease,'portal_recruitee'),fence.beforeSubmit(browserId,browserId,lease,'portal_recruitee')]);
    assert.equal(clicks.filter(Boolean).length,1);
    const restarted=durableBrowserFence({enabled:true,databaseUrl:url.href});
    assert.equal(await restarted.beforeSubmit(browserId,browserId,lease,'portal_recruitee'),false);
    assert.equal(await restarted.reserve(browserId,browserId),null);
    assert.equal(await db.applicationSubmissionReservation.count({where:{applicationId:browserId}}),1);
    assert.equal(posts(),0,'durable gate test never executes a provider request');
    const expiredId=await fixture('expired-browser');const expiredLease=await fence.reserve(expiredId,expiredId);assert.ok(expiredLease);
    await db.application.update({where:{id:expiredId},data:{leaseExpiresAt:new Date(Date.now()-1000)}});
    assert.equal(await fence.beforeData(expiredId,expiredId,expiredLease,'portal_recruitee'),false);
    const cappedId=await fixture('capped-browser');const cappedLease=await fence.reserve(cappedId,cappedId);assert.ok(cappedLease);
    process.env.APPLY_GLOBAL_DAILY_CAP='1';
    assert.equal(await fence.beforeData(cappedId,cappedId,cappedLease,'portal_recruitee'),false);
    assert.equal(await db.applicationSubmissionReservation.count(),1);
    await fence.close();await restarted.close();
    console.log('PASS durable browser seam: real ordinary gates/quota, concurrent claim, restart no repeat, zero provider POST');
  } finally { restore(); await fake.close(); await db.$disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
