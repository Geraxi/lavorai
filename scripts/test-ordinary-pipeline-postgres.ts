/** Ordinary worker, real gates/transactions/adapter/documents; fake AI + local HTTPS only. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
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
    const id=await fixture(); await run(id);
    let row=await db.application.findUniqueOrThrow({where:{id}});
    assert.equal(row.status,'success',row.errorMessage); assert.equal(row.submittedVia,'portal_recruitee');
    assert.equal(row.submitConfirmation,'DETECTED_HTTP_201'); assert.ok(row.submissionReceiptJson); assert.ok(row.submittedAt); assert.equal(view(row).phase,'confirmed');
    assert.equal(posts(),1); assert.ok(aiCalls>0); await run(id); assert.equal(posts(),1,'success never replayed');
    console.log('PASS ordinary success: AI, documents, actual adapter, gates, durable receipt; no repeat');
    const race=await fixture('race-two'); const before=posts(); await Promise.all(Array.from({length:6},()=>run(race)));
    assert.equal(posts()-before,1,'one atomic ordinary owner'); console.log('PASS ordinary concurrency');
    const uncertain=await fixture('server-500'); const n=posts(); await run(uncertain); await run(uncertain);
    row=await db.application.findUniqueOrThrow({where:{id:uncertain}});
    assert.equal(row.submitConfirmation,'UNCONFIRMED'); assert.equal(view(row).phase,'unconfirmed'); assert.notEqual(row.status,'success'); assert.equal(posts()-n,1);
    console.log('PASS ambiguous response retains fence and never repeats');
    for(const changes of [{privacyConsentAt:null},{subscriptionStatus:'paused'}]) {
      const blocked=await fixture('real-optional',changes); const n=posts(), a=aiCalls; await run(blocked);
      assert.equal(posts(),n); assert.equal(aiCalls,a); assert.notEqual((await db.application.findUniqueOrThrow({where:{id:blocked}})).status,'success');
    }
    const blank=await fixture('real-optional',{},'  '); const a=aiCalls; await run(blank);
    assert.equal(aiCalls,a,'unreadable CV must never reach AI'); assert.equal((await db.application.findUniqueOrThrow({where:{id:blank}})).status,'failed');
    console.log('PASS consent/billing/CV refusals before provider');
    unreadableAttachment = true;
    const badFile=await fixture('cv-required'); const badBefore=posts(); await run(badFile); unreadableAttachment=false;
    row=await db.application.findUniqueOrThrow({where:{id:badFile}});
    assert.equal(row.submitConfirmation,'NOT_SUBMITTED',row.errorMessage); assert.equal(row.sendStatus,'needs_user'); assert.equal(view(row).label,'Pronta, non inviata');
    assert.equal(row.leaseToken,null); assert.equal(posts(),badBefore); await run(badFile); assert.equal(posts(),badBefore);
    assert.equal(await db.applicationSubmissionReservation.count({where:{applicationId:badFile}}),1,'no refund/replay on refusal');
    console.log('PASS unreadable attachment is NOT_SUBMITTED, lease released, durable replay fence retained');
    fake.offerOverrides.set('cv-required',{options_photo:'required'});
    const required=await fixture('cv-required'); const requiredBefore=posts(); await run(required);
    row=await db.application.findUniqueOrThrow({where:{id:required}});
    assert.equal(posts(),requiredBefore); assert.equal(row.submitConfirmation,'NOT_SUBMITTED'); assert.match(row.errorMessage,/photo/);
    fake.offerOverrides.clear();
    console.log('PASS unsupported required field fails before candidate POST');
    wrongReceipt=true;
    const mismatched=await fixture('real-optional'); const mismatchedBefore=posts(); await run(mismatched); wrongReceipt=false;
    row=await db.application.findUniqueOrThrow({where:{id:mismatched}});
    assert.notEqual(row.status,'success'); assert.equal(row.submittedAt,null); assert.equal(row.sentProofRef,null);
    await run(mismatched); assert.equal(posts()-mismatchedBefore,1,'wrong receipt cannot authorize replay');
    console.log('PASS wrong-offer receipt cannot complete or send success notice');
    const free=await fixture('real-optional',{tier:'free',subscriptionStatus:null,currentPeriodEnd:null});
    const original=await db.application.findUniqueOrThrow({where:{id:free}});
    for(let i=0;i<5;i++) {
      const job=await db.job.create({data:{externalId:`quota-${i}`,source:'fixture',title:'Engineer',description:'Synthetic',url:`https://example.invalid/${i}`}});
      await db.application.create({data:{userId:original.userId,jobId:job.id,portal:'fixture',status:'success',submittedAt:new Date(),submittedVia:'portal_recruitee'}});
    }
    const q=posts(), ai=aiCalls; await run(free); assert.equal(posts(),q); assert.equal(aiCalls,ai);
    assert.match((await db.application.findUniqueOrThrow({where:{id:free}})).errorMessage,/gratuito/);
    console.log('PASS free weekly quota blocks ordinary worker before AI/submission');
    const raceFree=await fixture('race-ten',{tier:'free',subscriptionStatus:null,currentPeriodEnd:null});
    const raceRow=await db.application.findUniqueOrThrow({where:{id:raceFree}});
    for(let i=0;i<4;i++) {
      const job=await db.job.create({data:{externalId:`race-quota-${i}`,source:'fixture',title:'Engineer',description:'Synthetic',url:`https://example.invalid/race/${i}`}});
      await db.application.create({data:{userId:raceRow.userId,jobId:job.id,portal:'fixture',status:'success',submittedAt:new Date(),submittedVia:'portal_recruitee'}});
    }
    const competing=await fixture('real-optional');
    await db.application.update({where:{id:competing},data:{userId:raceRow.userId}});
    const raceBefore=posts(); await Promise.all([run(raceFree),run(competing)]);
    assert.equal(posts()-raceBefore,1,'only one remaining free-quota slot under concurrency');
    console.log('PASS ordinary concurrent free quota admits one remaining send');
    assert.equal(mails.length,3,'only proved successes schedule notifications');
    assert.equal(await db.emailLog.count(),3,'fake accepted notifications recorded');
    for(const mode of ['error','no_id']) {
      mailMode=mode; const noticeFailure=await fixture('real-optional'); const before=posts(); await run(noticeFailure);
      assert.equal((await db.application.findUniqueOrThrow({where:{id:noticeFailure}})).status,'success','email failure does not undo real ATS receipt');
      assert.equal(await db.emailLog.count(),3,'provider error/missing ID never logged as sent');
      await run(noticeFailure); assert.equal(posts()-before,1,'notification error cannot retry application');
    }
    console.log('PASS notification error/missing ID never recorded sent, no application replay');
    const {recordAtsConfirmation}=req('./inbound/service');
    const pendingBefore=await db.application.findUniqueOrThrow({where:{id:free}});
    assert.equal(await recordAtsConfirmation(db,{applicationId:free,userId:original.userId,inboundEmailId:'spoofed-receipt',at:new Date()}),false);
    const pendingAfter=await db.application.findUniqueOrThrow({where:{id:free}});
    assert.equal(pendingAfter.confirmedAt,null); assert.equal(pendingAfter.sendStatus,pendingBefore.sendStatus);
    assert.equal(pendingAfter.sentProofRef,pendingBefore.sentProofRef);
    console.log('PASS heuristic inbound receipt cannot promote unsubmitted application');
    assert.deepEqual(forbidden,[],'no external network attempted');
    console.log('PASS zero external requests; notifications use fake SDK only');
  } finally { restore(); await fake.close(); await db.$disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
