/** Ordinary worker, real gates/transactions/adapter/documents; fake AI + local HTTPS only. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { encode } from 'next-auth/jwt';
import { startFakeRecruiteeServer, installFakeRecruiteeFetch } from './fake-recruitee-server';

async function main() {
  const url = new URL(process.env.ORDINARY_TEST_DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.pathname, /^\/lavorai_ordinary_http_test$/);
  const preserved={PATH:process.env.PATH,HOME:process.env.HOME,ORDINARY_TEST_DATABASE_URL:url.href};
  for(const key of Object.keys(process.env))delete process.env[key];
  Object.assign(process.env,preserved);
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
  process.env.NODE_ENV='production';
  assert.throws(()=>installFakeRecruiteeFetch({port:fake.port,ca:fake.ca}),/cannot be installed in production/);
  process.env.NODE_ENV='test';
  const nativeFetch=globalThis.fetch;
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
  let expireAfterResponse:string|null=null;
  adapter.apply=async (...args:any[])=>{
    const result=await originalApply(...args);
    if(expireAfterResponse && result.receipt)await db.application.update({where:{id:expireAfterResponse},data:{leaseExpiresAt:new Date(Date.now()-1000)}});
    if(wrongReceipt && result.receipt) result.receipt={...result.receipt,jobId:'different-offer'};
    return result;
  };
  let seq=0;
  async function fixture(slug='real-optional', userChanges: any={}, text='Synthetic ordinary engineer with TypeScript skills') {
    const id=`ordinary-${++seq}`; const now=new Date();
    const user=await db.user.create({data:{id,email:`${id}@example.test`,name:'Synthetic Ordinary',tier:'pro',subscriptionStatus:'active',currentPeriodEnd:new Date(+now+86400000),emailVerified:now,privacyConsentAt:now,onboardedAt:now,seniority:'mid',englishLevel:'B2',noticePeriod:'immediate',...userChanges,
      preferences:{create:{autoApplyMode:'auto',rolesJson:'["Engineer"]',locationsJson:'["Milano"]',matchMin:0,employmentType:'both',sourcesJson:'["office"]',salaryMin:0}},
      cvProfile:{create:{firstName:'Synthetic',lastName:'Ordinary',email:`${id}@example.test`,phone:'+390212345678',city:'Milano',title:'Engineer',summary:'Synthetic ordinary engineer',skillsJson:'["TypeScript"]'}},
      cvDocuments:{create:{originalFilename:'synthetic.txt',storagePath:'fixture-only',extractedText:text}}}});
    const job=await db.job.create({data:{externalId:id,source:'recruitee',title:'Engineer',company:'Synthetic',description:'Engineer TypeScript '+ 'Synthetic engineering development TypeScript team. '.repeat(40),publicationVerifiedAt:now,applicationFormCapability:'standard',location:'Milano',url:`https://fake-lavorai.recruitee.com/o/${slug}`}});
    // Applications are created by actual HTTP routes / ordinary producer, never seeded.
    await db.userPreferences.update({where:{userId:id},data:{autoApplyMode:'manual'}});
    return {id,jobId:job.id};
  }
  const temp=mkdtempSync(`${tmpdir()}/lavorai-http-proof-`);
  // This preload is generated only inside a disposable test directory. It cannot
  // redirect an ATS POST: the web process is forbidden from any non-loopback I/O.
  const guard=resolve(temp,'network-guard.cjs');
  writeFileSync(guard,`const net=require('node:net');const original=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const a=args[0];const o=Array.isArray(a)?a[0]:a;const host=typeof o==='object'?o.host:args[1];if(host&&!['127.0.0.1','localhost','::1'].includes(host))throw new Error('TEST_EXTERNAL_NETWORK_BLOCKED');return original.apply(this,args)};
const originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input.url||input);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw new Error('TEST_EXTERNAL_FETCH_BLOCKED');return originalFetch(input,init)};`);
  const base='http://127.0.0.1:3089', secret='synthetic-http-auth-secret-no-real-access';
  const start=new Date(Date.now()-3600000).toISOString();
  Object.assign(process.env,{APPLICATION_PROVIDER_POLICY:'recruitee_only',APPLICATION_PROVIDER_NOT_BEFORE:start,
    APPLICATION_ROLLOUT_START_AT:start,INBOUND_EMAIL_DOMAIN:'inbound.example.test',QUEUE_MODE:'db',AUTH_SECRET:secret,
    AUTH_TRUST_HOST:'true',NEXTAUTH_URL:base,RESEND_WEBHOOK_SECRET:`whsec_${Buffer.from('local-test-signature-key').toString('base64')}`});
  const childEnv={...process.env,NODE_ENV:'production',NODE_OPTIONS:`--require=${guard}`,RESEND_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1'};
  let logs='';
  const app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p','3089'],{env:childEnv,stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',b=>{logs+=b;});app.stderr.on('data',b=>{logs+=b;});
  async function api(path:string,userId?:string,body?:unknown,extra:Record<string,string>={}){
    const cookie=userId?`authjs.session-token=${await encode({secret,salt:'authjs.session-token',token:{sub:userId,tier:'pro',email:`${userId}@example.test`},maxAge:3600})}`:'';
    const r=await nativeFetch(base+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin:base,'content-type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(45000)});
    const text=await r.text();let value:any;try{value=JSON.parse(text)}catch{value=text}
    return {status:r.status,body:value};
  }
  async function row(id:string){return db.application.findUniqueOrThrow({where:{id}})}
  async function apply(f:{id:string;jobId:string}){const r=await api('/api/applications/apply',f.id,{jobId:f.jobId,portal:'recruitee'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.status,'queued');return r.body.applicationId as string;}
  async function processQueued(id:string){
    const {claimApplication}=req('./application-claim');assert.equal(await claimApplication(id),true,'actual atomic claim');await run(id);
  }
  try {
    for(let i=0;i<60;i++){try{await nativeFetch(base+'/api/auth/csrf',{signal:AbortSignal.timeout(1000)});break;}catch{if(app.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,500));}}
    assert.equal((await api('/api/applications')).status,401,'real production-mode auth rejects missing session');
    const manual=await fixture();const id=await apply(manual);
    assert.equal(posts(),0,'HTTP enqueue does not submit');
    assert.equal((await api('/api/applications/apply',manual.id,{jobId:manual.jobId,portal:'recruitee'})).status,409);
    assert.equal(await db.application.count({where:{userId:manual.id}}),1);
    await processQueued(id);assert.equal(posts(),1);assert.equal((await row(id)).status,'success');assert.ok((await row(id)).submissionReceiptJson);
    await run(id);assert.equal(posts(),1);
    const list=await api('/api/applications',manual.id);assert.equal(list.status,200);assert.match(JSON.stringify(list.body),new RegExp(id));assert.match(JSON.stringify(list.body),/DETECTED_HTTP_201/);
    assert.equal((await api('/applications',manual.id)).status,200,'real dashboard SSR');
    console.log('PASS HTTP manual: actual auth/apply/duplicate refusal -> PostgreSQL queue/claim -> worker + HTTPS ATS -> receipt -> owner dashboard, exactly 1 POST');

    // Known privacy refusal is exercised through the HTTP entry point, not a mocked gate.
    const blocked=await fixture('privacy-blocked',{privacyConsentAt:null});
    const refusal=await api('/api/applications/apply',blocked.id,{jobId:blocked.jobId,portal:'recruitee'});
    assert.equal(refusal.status,409,JSON.stringify(refusal));assert.equal(await db.application.count({where:{userId:blocked.id}}),0);assert.equal(posts(),1);
    console.log('PASS HTTP missing privacy: actionable refusal, zero applications/POSTs');

    // Close prior fixtures locally to make each producer's candidate set exact.
    await db.job.updateMany({data:{closedAt:new Date()}});
    for(const mode of ['hybrid','auto']){
      const f=await fixture(mode==='hybrid'?'race-two':'race-ten');
      await db.userPreferences.update({where:{userId:f.id},data:{autoApplyMode:mode}});
      const stats=await req('./auto-apply-cron').runAutoApplyForUser(f.id);
      const created=await db.application.findMany({where:{userId:f.id}});
      assert.equal(created.length,1,JSON.stringify(stats));const a=created[0];
      if(mode==='hybrid'){
        assert.equal(a.status,'awaiting_consent');const before=posts();await run(a.id);assert.equal(posts(),before);
        const consent=await api('/api/applications/consent',f.id,{ids:[a.id]});assert.equal(consent.status,200,JSON.stringify(consent));assert.equal(consent.body.enqueued,1,JSON.stringify(consent));
        const repeat=await api('/api/applications/consent',f.id,{ids:[a.id]});assert.equal(repeat.body.enqueued,0);
      }else assert.equal(a.status,'queued');
      const before=posts();await processQueued(a.id);assert.equal(posts(),before+1);assert.equal((await row(a.id)).status,'success');await run(a.id);assert.equal(posts(),before+1);
      await db.job.update({where:{id:f.jobId},data:{closedAt:new Date()}});
      console.log(`PASS ${mode}: real producer${mode==='hybrid'?' + HTTP explicit approval':''} -> atomic queue claim -> actual worker/HTTPS receipt, exactly 1 POST, no replay`);
    }
    const beforePaused=posts();const paused=await fixture('race-two');
    const session=await req('./apply-session').resolveSession(paused.id,{title:'Engineer',category:null});
    await db.applicationSession.update({where:{id:session.id},data:{status:'paused'}});
    const pa=await api('/api/applications/apply',paused.id,{jobId:paused.jobId,portal:'recruitee'});
    assert.equal(pa.status,200);assert.equal(pa.body.status,'awaiting_consent');
    const approval=await api('/api/applications/consent',paused.id,{ids:[pa.body.applicationId]});
    assert.equal(approval.status,409);assert.equal(approval.body.error,'session_inactive');assert.equal((await row(pa.body.applicationId)).status,'awaiting_consent');assert.equal(posts(),beforePaused);
    console.log('PASS HTTP paused session: apply held, approval refuses with explicit recovery action, no queue/POST');
    const unanswered=await fixture('needs-answers');const unansweredId=await apply(unanswered);const beforeQuestions=posts();await processQueued(unansweredId);
    assert.equal(posts(),beforeQuestions);assert.equal((await row(unansweredId)).status,'ready_to_apply');assert.equal((await row(unansweredId)).sendStatus,'needs_user');assert.equal((await row(unansweredId)).submitConfirmation,'NOT_SUBMITTED');
    console.log('PASS HTTP changed required-question form: not submitted, needs_user and zero POST; no invented answer');
    for(const kind of ['wrong-receipt','expired-lease']){
      const f=await fixture('missing-cv');const a=await apply(f);const before=posts();
      const {claimApplication}=req('./application-claim');const claims=await Promise.all([claimApplication(a),claimApplication(a)]);assert.equal(claims.filter(Boolean).length,1);
      wrongReceipt=kind==='wrong-receipt';expireAfterResponse=kind==='expired-lease'?a:null;
      await run(a);wrongReceipt=false;expireAfterResponse=null;
      assert.equal(posts(),before+1);assert.notEqual((await row(a)).status,'success');assert.equal((await row(a)).submissionReceiptJson,null);assert.equal((await row(a)).status,'ready_to_apply');assert.equal((await row(a)).submitConfirmation,'UNCONFIRMED');assert.equal((await row(a)).sendStatus,'needs_user');
      const held=await row(a);const originalLease=req('./application-lease').asWorkLease(held.startedAt,held.leaseToken);
      // Adversarial fixture: replacement owner acquired the row. Old worker must
      // not quarantine it, even if the original timestamp happens to be equal.
      await db.application.update({where:{id:a},data:{status:'applying',submitConfirmation:'SUBMISSION_STARTED',leaseToken:'replacement-owner'}});
      assert.equal(await req('./application-worker-gates').holdUncommittedSubmission(a,originalLease),false,'stale owner must not overwrite replacement lease');
      assert.equal((await row(a)).status,'applying');assert.equal((await row(a)).leaseToken,'replacement-owner');
      await db.application.update({where:{id:a},data:{status:held.status,submitConfirmation:held.submitConfirmation,leaseToken:held.leaseToken}});
      await run(a);assert.equal(posts(),before+1);
      console.log(`PASS HTTP ${kind}: concurrent claim has one owner; response cannot bypass receipt/lease fence; no false success or replay`);
    }
    for(const behavior of ['validation422','timeout'] as const){
      const slug=behavior==='validation422'?'dry-optional':'cv-required';const f=await fixture(slug);fake.postBehavior.set(slug,behavior);const a=await apply(f);const before=posts();await processQueued(a);assert.equal(posts(),before+1);
      const r=await row(a);assert.notEqual(r.status,'success');assert.equal(r.submitConfirmation,behavior==='validation422'?'REJECTED_NOT_SENT':'UNCONFIRMED',JSON.stringify({status:r.status,confirmation:r.submitConfirmation,error:r.errorMessage}));
      await run(a);assert.equal(posts(),before+1);console.log(`PASS HTTP ${behavior}: truthful durable outcome, exactly 1 POST and no retry`);
    }
    // Signed reply on the SAME manually applied application, held notifications.
    const raw={type:'email.received',created_at:new Date().toISOString(),data:{email_id:'http-synthetic-reply',to:[`reply+${id}@inbound.example.test`],from:'Recruiter <recruiter@example.test>',subject:'Interview',text:'Are you available for an interview next week?'}};
    const timestamp=String(Math.floor(Date.now()/1000)),event='http-signed-event';
    const signature=createHmac('sha256','local-test-signature-key').update(`${event}.${timestamp}.${JSON.stringify(raw)}`).digest('base64');
    assert.equal((await api('/api/webhooks/resend',undefined,raw)).status,401);
    const headers={'svix-id':event,'svix-timestamp':timestamp,'svix-signature':`v1,${signature}`};
    for(let i=0;i<2;i++){const r=await api('/api/webhooks/resend',undefined,raw,headers);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.matched,true);}
    const replies=await db.applicationReply.findMany({where:{applicationId:id}});assert.equal(replies.length,1);assert.equal((await row(id)).replyCount,1);assert.equal((await row(id)).status,'success');
    assert.equal((await api('/posta',manual.id)).status,200,'owner inbox SSR');
    const context=await api(`/api/inbox/replies?parentId=application_reply:${replies[0].id}`,manual.id);assert.equal(context.status,503,JSON.stringify(context));assert.equal(context.body.error,'reply_service_unavailable','outbound reply composer fails closed without provider credentials; reading inbox remains available');
    assert.equal((await api(`/api/inbox/replies?parentId=application_reply:${replies[0].id}`,blocked.id)).status,404);
    // Real rendered UI, isolated Chrome context; no personal browser profile.
    const {chromium}=await import('playwright');
    const browser=await chromium.launch({...(process.platform==='darwin'?{channel:'chrome'}:{}),headless:true});
    try{
      const context=await browser.newContext();
      await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      await context.addCookies([{name:'authjs.session-token',value:await encode({secret,salt:'authjs.session-token',token:{sub:manual.id,tier:'pro',email:`${manual.id}@example.test`},maxAge:3600}),url:base}]);
      const page=await context.newPage();
      mkdirSync('output/playwright',{recursive:true});
      await page.goto(base+'/applications',{waitUntil:'networkidle'});
      assert.match(await page.locator('body').innerText(),/Engineer/);
      await page.screenshot({path:'output/playwright/ordinary-http-applications.png',fullPage:true});
      await page.goto(base+'/posta',{waitUntil:'networkidle'});
      assert.match(await page.locator('body').innerText(),/Interview/);
      await page.screenshot({path:'output/playwright/ordinary-http-inbox.png',fullPage:true});
      console.log('PASS rendered Chrome applications + inbox: accepted synthetic application and correlated reply visible');
    }finally{await browser.close();}
    assert.ok(mails.every(m=>String(m.to).endsWith('@example.test')),'only synthetic notification recipients');assert.deepEqual(forbidden,[]);
    console.log('PASS HTTP signed webhook -> exact application alias -> one durable owner inbox reply; duplicate/unsigned/cross-owner rejected; no Gmail or outbound email');
    console.log(JSON.stringify({result:'PASS',atsPosts:posts(),accepted:await db.application.count({where:{status:'success'}}),replies:replies.length,fakeNotificationCalls:mails.length,externalRequests:forbidden.length,productionChanges:0}));
  } catch(e){console.error('LOCAL APP LOG',logs.slice(-10000));throw e;}
  finally{app.kill('SIGTERM');await Promise.race([new Promise(r=>app.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);if(app.exitCode===null)app.kill('SIGKILL');restore();await fake.close();await db.$disconnect();rmSync(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
