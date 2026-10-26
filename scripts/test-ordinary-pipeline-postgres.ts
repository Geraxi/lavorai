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
    // Bounded ordinary validation: keep the production-style holds ON.
    const scoped=await fixture('real-optional');
    const outsider=await fixture('race-two');
    const selected=await db.application.findUniqueOrThrow({where:{id:scoped},include:{job:true,user:true}});
    const windowStart=new Date(+selected.createdAt-1000);
    Object.assign(process.env,{APPLICATIONS_PAUSED:'true',USER_NOTIFICATIONS_HOLD:'true',ATS_TEST_REAL_SUBMIT:'false',
      ORDINARY_VALIDATION_APPLICATION_ID:scoped,ORDINARY_VALIDATION_USER_ID:selected.userId,
      ORDINARY_VALIDATION_JOB_ID:selected.jobId,ORDINARY_VALIDATION_USER_EMAIL:selected.user.email,ORDINARY_VALIDATION_RECIPIENT:selected.user.email,
      ORDINARY_VALIDATION_OFFER_URL:selected.job.url,ORDINARY_VALIDATION_STARTED_AT:windowStart.toISOString(),
      ORDINARY_VALIDATION_EXPIRES_AT:new Date(+windowStart+15*60_000).toISOString()});
    const {ordinaryValidationConfig}=req('./ordinary-validation');
    const {applicationsPaused}=req('./application-pause');
    assert.ok(ordinaryValidationConfig()); assert.equal(applicationsPaused(),true);
    const {drainQueuedApplications}=req('./queue-drain');
    const {runAutoApplyCron}=req('./auto-apply-cron');
    const scopedBefore=posts(), noticesBefore=mails.length, aiBefore=aiCalls;
    assert.equal((await drainQueuedApplications({findClaimableQueued:()=>{throw new Error('must not read queue')}})).claimed,0);
    await runAutoApplyCron();
    await Promise.all(Array.from({length:4},()=>run(outsider)));
    assert.equal(aiCalls,aiBefore); assert.equal(posts(),scopedBefore);
    const savedEmail=process.env.ORDINARY_VALIDATION_USER_EMAIL;
    process.env.ORDINARY_VALIDATION_USER_EMAIL='wrong@example.test'; await run(scoped);
    assert.equal(aiCalls,aiBefore); process.env.ORDINARY_VALIDATION_USER_EMAIL=savedEmail;
    await db.user.update({where:{id:selected.userId},data:{privacyConsentAt:null}}); await run(scoped);
    assert.equal(posts(),scopedBefore,'scope cannot bypass consent');
    await db.user.update({where:{id:selected.userId},data:{privacyConsentAt:new Date()}});
    // A held attempt changed only startedAt, not its queued eligibility. Clear
    // this LOCAL fixture timestamp before the route's fresh-row preflight.
    await db.application.update({where:{id:scoped},data:{startedAt:null,errorMessage:null}});
    let adminSession:any={email:'umbertogeraci0@gmail.com'};
    fakeModule('./session',{getCurrentUser:async()=>adminSession});
    const route=req('../app/api/admin/ordinary-validation/route');
    const {NextRequest}=req('next/server');
    const request=(id=scoped,origin='http://localhost:3000')=>new NextRequest('http://localhost:3000/api/admin/ordinary-validation',{method:'POST',headers:{host:'localhost:3000',origin,'content-type':'application/json'},body:JSON.stringify({applicationId:id})});
    assert.equal((await route.POST(request(outsider))).status,400);
    assert.equal((await route.POST(request(scoped,'https://evil.invalid'))).status,403);
    adminSession=null; assert.equal((await route.POST(request())).status,403); adminSession={email:'umbertogeraci0@gmail.com'};
    const runs=await Promise.all([route.POST(request()),route.POST(request()),run(outsider)]);
    assert.equal(posts()-scopedBefore,1,'only scoped ordinary application crosses provider boundary');
    assert.equal((await db.application.findUniqueOrThrow({where:{id:scoped}})).status,'success');
    assert.equal((await db.application.findUniqueOrThrow({where:{id:outsider}})).status,'queued');
    assert.equal(mails.length,noticesBefore,'application notifications stay held');
    assert.equal((await route.POST(request())).status,409,'no repeat/reset via route');
    process.env.APPLICATIONS_PAUSED='false'; assert.equal(applicationsPaused(),true); assert.equal(ordinaryValidationConfig(),null);
    await run(outsider); assert.equal(posts()-scopedBefore,1);
    process.env.APPLICATIONS_PAUSED='true'; process.env.ORDINARY_VALIDATION_EXPIRES_AT=new Date(Date.now()-1000).toISOString();
    assert.equal((await route.POST(request())).status,409); await run(outsider); assert.equal(posts()-scopedBefore,1);
    console.log('PASS bounded ordinary validation: only scoped row, real consent/quota gates, concurrent single POST, producers/customer mail held, wrong user/origin/recipient/expiry refused');

    // Owner preparation is an atomic fixture transaction, never a submission.
    const owner=req('./ordinary-validation-owner');
    const fixedUser='cmvnz41b9pvoty0ufujkkx0zw';
    await db.user.create({data:{id:fixedUser,email:'email-test-20261025@lavorai.it',name:'Internal fixture',tier:'free',emailVerified:new Date(),preferences:{create:{autoApplyMode:'off',autoApplyOn:false}}}});
    const fakePdf=async()=>Buffer.from('%PDF-1.4 synthetic test bytes');
    const beforeOwnerPosts=posts();
    await db.job.create({data:{id:owner.OWNER_APP+'_job',externalId:'collision-only',source:'fixture',title:'collision',description:'local rollback test',url:'https://example.invalid/rollback'}});
    await assert.rejects(()=>owner.prepareOwnerFixture(db,'owner-admin','+390000000000',fakePdf));
    assert.equal((await db.user.findUniqueOrThrow({where:{id:fixedUser}})).privacyConsentAt,null,'transaction rollback preserves consent');
    assert.equal((await db.userPreferences.findUniqueOrThrow({where:{userId:fixedUser}})).autoApplyMode,'off');
    assert.equal(await db.cVDocument.count({where:{userId:fixedUser}}),0);
    assert.equal(await db.cVProfile.count({where:{userId:fixedUser}}),0);
    await db.job.delete({where:{id:owner.OWNER_APP+'_job'}});
    await Promise.all(Array.from({length:4},()=>owner.prepareOwnerFixture(db,'owner-admin','+390000000000',fakePdf)));
    assert.equal(await db.application.count({where:{id:owner.OWNER_APP}}),1);
    assert.equal(await db.cVDocument.count({where:{userId:fixedUser}}),1);
    const fixed=await db.user.findUniqueOrThrow({where:{id:fixedUser},include:{preferences:true}});
    assert.ok(fixed.privacyConsentAt); assert.equal(fixed.tier,'free');assert.equal(fixed.subscriptionStatus,null);assert.equal(fixed.preferences.autoApplyOn,false);
    const source=await db.cVDocument.findFirstOrThrow({where:{userId:fixedUser}});
    assert.ok((await storage.readUserFile(source.storagePath)).subarray(0,5).equals(Buffer.from('%PDF-')));
    assert.equal(posts(),beforeOwnerPosts,'prepare cannot submit');
    await assert.rejects(()=>owner.prepareOwnerFixture(db,'owner-admin','+391111111111',fakePdf),/prepared_phone_mismatch/);
    const fixedApp=await db.application.findUniqueOrThrow({where:{id:owner.OWNER_APP}});
    Object.assign(process.env,{ORDINARY_VALIDATION_APPLICATION_ID:owner.OWNER_APP,ORDINARY_VALIDATION_USER_ID:fixedUser,ORDINARY_VALIDATION_USER_EMAIL:fixed.email,
      ORDINARY_VALIDATION_JOB_ID:fixedApp.jobId,ORDINARY_VALIDATION_RECIPIENT:fixed.email,ORDINARY_VALIDATION_OFFER_URL:'https://produzioneweb.recruitee.com/o/lavorai-test-ordinary-validation',
      ORDINARY_VALIDATION_CREATED_AT:fixedApp.createdAt.toISOString(),ORDINARY_VALIDATION_STARTED_AT:new Date().toISOString(),ORDINARY_VALIDATION_EXPIRES_AT:new Date(Date.now()+15*60_000).toISOString()});
    const gates=req('./application-worker-gates');
    assert.equal(await gates.reserveApplicationWork(owner.OWNER_APP,db),null,'scope alone cannot admit unclaimed owner fixture');
    await assert.rejects(()=>owner.claimOwnerInvocation(db),/recipient_unverified/);
    await owner.verifyOwnerRecipient(db,fixed.email,'Synthetic local ownership/receiving attestation only; fake providers.');
    const claims=await Promise.allSettled([owner.claimOwnerInvocation(db),owner.claimOwnerInvocation(db)]);
    assert.equal(claims.filter(x=>x.status==='fulfilled').length,1,'one durable invocation claim');
    await db.userPreferences.update({where:{userId:fixedUser},data:{autoApplyMode:'auto',autoApplyOn:true}});
    await owner.closeOwnerFixture(db); await owner.closeOwnerFixture(db);
    assert.equal((await db.userPreferences.findUniqueOrThrow({where:{userId:fixedUser}})).autoApplyMode,'off');
    assert.equal(await gates.reserveApplicationWork(owner.OWNER_APP,db),null);
    await assert.rejects(()=>owner.prepareOwnerFixture(db,'owner-admin','+390000000000',fakePdf),/fixture_closed/);
    assert.equal(posts(),beforeOwnerPosts);assert.equal(mails.length,noticesBefore);
    console.log('PASS owner flow: concurrent prepare idempotent, no entitlement change, private inline CV, durable single claim, closed fixture cannot reopen/send');
    const mainOwner=req('./ordinary-main-validation-owner');
    const mainScope=req('./ordinary-main-validation-scope');
    const mainUser=mainScope.MAIN_VALIDATION_USER;
    await db.user.create({data:{id:mainUser,email:mainScope.MAIN_VALIDATION_EMAIL,tier:'free',emailVerified:new Date(),privacyConsentAt:new Date(),preferences:{create:{autoApplyMode:'auto',autoApplyOn:true}},cvProfile:{create:{firstName:'Synthetic',lastName:'Ordinary',email:mainScope.MAIN_VALIDATION_EMAIL,phone:'+390000000000',summary:'Synthetic ordinary local fixture'}},cvDocuments:{create:{originalFilename:'synthetic-local-only.txt',storagePath:'fixture-only',extractedText:'Synthetic ordinary local fixture'}}}});
    const sourceMain=await mainScope.mainSourceSnapshot(db);
    const preserved=JSON.stringify(await db.user.findUnique({where:{id:mainUser},include:{preferences:true,cvProfile:true,cvDocuments:true}}));
    const mainBefore=posts();
    await assert.rejects(()=>mainOwner.prepareMainApplication(db,'wrong',sourceMain.cvHash),/confirmed_cv_changed/);
    await Promise.all(Array.from({length:4},()=>mainOwner.prepareMainApplication(db,sourceMain.cvId,sourceMain.cvHash)));
    assert.equal(await db.application.count({where:{id:mainScope.MAIN_VALIDATION_APP}}),1);
    assert.equal(JSON.stringify(await db.user.findUnique({where:{id:mainUser},include:{preferences:true,cvProfile:true,cvDocuments:true}})),preserved,'prepare preserves every owner field/document');
    const mainApp=await db.application.findUniqueOrThrow({where:{id:mainScope.MAIN_VALIDATION_APP}});
    const mainStart=new Date();
    Object.assign(process.env,{ORDINARY_VALIDATION_APPLICATION_ID:mainApp.id,ORDINARY_VALIDATION_USER_ID:mainUser,ORDINARY_VALIDATION_USER_EMAIL:mainScope.MAIN_VALIDATION_EMAIL,ORDINARY_VALIDATION_JOB_ID:mainApp.jobId,ORDINARY_VALIDATION_RECIPIENT:mainScope.MAIN_VALIDATION_EMAIL,ORDINARY_VALIDATION_OFFER_URL:mainScope.MAIN_VALIDATION_OFFER,ORDINARY_VALIDATION_CREATED_AT:mainApp.createdAt.toISOString(),ORDINARY_VALIDATION_STARTED_AT:mainStart.toISOString(),ORDINARY_VALIDATION_EXPIRES_AT:new Date(+mainStart+15*60_000).toISOString()});
    assert.equal(await gates.reserveApplicationWork(mainApp.id,db),null,'main window alone cannot start preparation');
    await assert.rejects(()=>mainOwner.claimMainInvocation(db),/already_invoked/);
    await mainOwner.verifyMainRecipient(db,mainScope.MAIN_VALIDATION_EMAIL,'Local-only simulated receiving verification; never sent externally.');
    await db.cVDocument.update({where:{id:sourceMain.cvId},data:{extractedText:'changed'}});
    await assert.rejects(()=>mainOwner.claimMainInvocation(db),/source_changed/);
    await db.cVDocument.update({where:{id:sourceMain.cvId},data:{extractedText:'Synthetic ordinary local fixture'}});
    const mainClaims=await Promise.allSettled([mainOwner.claimMainInvocation(db),mainOwner.claimMainInvocation(db)]);
    assert.equal(mainClaims.filter(r=>r.status==='fulfilled').length,1);
    const savedWindow=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('ORDINARY_VALIDATION_')));
    for(const key of Object.keys(savedWindow))delete process.env[key];
    process.env.APPLICATIONS_PAUSED='false';
    assert.equal(await gates.reserveApplicationWork(mainApp.id,db),null,'interrupted dedicated invocation cannot join a later general release without its exact window');
    Object.assign(process.env,savedWindow,{APPLICATIONS_PAUSED:'true'});
    await run(mainApp.id); await mainOwner.closeMainInvocation(db);
    const mainOutcome=await db.application.findUniqueOrThrow({where:{id:mainApp.id}});
    assert.equal(mainOutcome.status,'success',mainOutcome.errorMessage);assert.equal(mainOutcome.submitConfirmation,'DETECTED_HTTP_201');
    assert.equal(posts()-mainBefore,1);assert.equal(mails.length,noticesBefore);
    await run(mainApp.id); await mainOwner.closeMainInvocation(db);assert.equal(posts()-mainBefore,1);
    await assert.rejects(()=>mainOwner.claimMainInvocation(db),/already_invoked/);
    assert.equal(JSON.stringify(await db.user.findUnique({where:{id:mainUser},include:{preferences:true,cvProfile:true,cvDocuments:true}})),preserved,'ordinary execution and close preserve owner settings/profile/documents');
    assert.equal(mainScope.mainMeta(mainOutcome.userProvidedAnswersJson).state,'closed');
    console.log('PASS main owner flow: idempotent prepare, source pinning, one atomic claim/ordinary fake POST, receipt, closed no-retry, owner settings and documents preserved');
    // Customer rollout uses the real ordinary worker and fake provider, not the diagnostic path.
    for(const key of Object.keys(process.env))if(key.startsWith('ORDINARY_VALIDATION_'))delete process.env[key];
    const customer=req('./customer-rollout');
    const customerDrain=req('./customer-rollout-drain');
    async function cohort(ids:string[],batchId:string,cap=ids.length,recipientOverride?:string){
      const rows=await db.application.findMany({where:{id:{in:ids}},include:{user:true,job:true}});
      const start=new Date();
      process.env.CUSTOMER_ROLLOUT_ENABLED='true';
      process.env.CUSTOMER_ROLLOUT_MANIFEST=JSON.stringify({batchId,startedAt:start.toISOString(),expiresAt:new Date(+start+15*60_000).toISOString(),notBefore:new Date(+start-60_000).toISOString(),maxAttempts:cap,applications:rows.map((r:any)=>({applicationId:r.id,userId:r.userId,jobId:r.jobId,url:r.job.url,recipient:recipientOverride??r.user.email,createdAt:r.createdAt.toISOString()}))});
    }
    const cohortIds=await Promise.all(Array.from({length:5},()=>fixture('real-optional')));
    const unrelated=await fixture('race-two');
    await cohort(cohortIds,'concurrency',2);
    const cp=posts(),ca=aiCalls;
    process.env.CUSTOMER_ROLLOUT_ENABLED='false';await run(cohortIds[0]);assert.equal(aiCalls,ca);
    process.env.CUSTOMER_ROLLOUT_ENABLED='true';await run(unrelated);assert.equal(aiCalls,ca);
    await Promise.all(cohortIds.flatMap(id=>[run(id),run(id)]));
    assert.equal(posts()-cp,2,'shared cohort cap across users/processes');
    assert.equal((await db.applicationReleaseBatch.findUniqueOrThrow({where:{id:'customer:concurrency'}})).usedCount,2);
    assert.equal(await db.applicationReleaseGrant.count({where:{batchId:'customer:concurrency'}}),2);
    const repeat=posts();await customerDrain.drainCustomerRollout(run,db);assert.equal(posts(),repeat);
    process.env.CUSTOMER_ROLLOUT_ENABLED='false';assert.equal((await customerDrain.drainCustomerRollout(()=>{throw Error('disabled drain invoked')},db)).active,false);
    delete process.env.CUSTOMER_ROLLOUT_MANIFEST;delete process.env.CUSTOMER_ROLLOUT_ENABLED;process.env.APPLICATIONS_PAUSED='false';
    const granted=await db.applicationReleaseGrant.findMany({where:{batchId:'customer:concurrency'}});
    for(const g of granted)await run(g.applicationId);assert.equal(posts(),repeat,'persisted cohort grants cannot replay after general reopening');
    process.env.APPLICATIONS_PAUSED='true';
    const noConsent=await fixture('real-optional',{privacyConsentAt:null});await cohort([noConsent],'no-consent');const nc=posts();await run(noConsent);assert.equal(posts(),nc);assert.equal(await db.applicationReleaseGrant.count({where:{applicationId:noConsent}}),0);
    const wrongRole=await fixture('real-optional');const wr=await db.application.findUniqueOrThrow({where:{id:wrongRole}});await db.userPreferences.update({where:{userId:wr.userId},data:{rolesJson:'["Nurse"]'}});await cohort([wrongRole],'wrong-role');await run(wrongRole);assert.equal(posts(),nc);assert.equal(await db.applicationReleaseGrant.count({where:{applicationId:wrongRole}}),0);
    const wrongRecipient=await fixture('real-optional');await cohort([wrongRecipient],'wrong-recipient',1,'other@example.test');await run(wrongRecipient);assert.equal(posts(),nc,'recipient mismatch never reaches candidate POST');
    const expired=await fixture('real-optional');await cohort([expired],'expired');let cm=JSON.parse(process.env.CUSTOMER_ROLLOUT_MANIFEST!);cm.expiresAt=new Date(Date.now()-1).toISOString();process.env.CUSTOMER_ROLLOUT_MANIFEST=JSON.stringify(cm);await run(expired);assert.equal(posts(),nc);
    const uncertainCustomer=await fixture('server-500');await cohort([uncertainCustomer],'uncertain');await run(uncertainCustomer);await run(uncertainCustomer);assert.equal(posts()-nc,1);assert.notEqual((await db.application.findUniqueOrThrow({where:{id:uncertainCustomer}})).status,'success');
    const stopped=await fixture('real-optional');await cohort([stopped],'stopped');await customer.stopCustomerBatch(db,'stopped');const stopPosts=posts();await run(stopped);assert.equal(posts(),stopPosts);assert.equal(await db.applicationReleaseGrant.count({where:{applicationId:stopped}}),0);
    const late=await fixture('real-optional');await cohort([late],'late-receipt');
    adapter.apply=async(...args:any[])=>{const result=await originalApply(...args);await customer.stopCustomerBatch(db,'late-receipt');process.env.CUSTOMER_ROLLOUT_ENABLED='false';return result;};
    await run(late);adapter.apply=originalApply;
    assert.equal((await db.application.findUniqueOrThrow({where:{id:late}})).status,'success','accepted receipt persists even when stop switch flips after provider response');
    assert.equal(mails.length,noticesBefore);
    console.log('PASS customer rollout: default/disabled/expiry, exact cohort, atomic cap, ordinary consent/matching, recipient fence, no uncertainty replay, late accepted receipt retained, no customer notifications');
    assert.deepEqual(forbidden,[],'no external network attempted');
    console.log('PASS zero external requests; notifications use fake SDK only');
  } finally { restore(); await fake.close(); await db.$disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
