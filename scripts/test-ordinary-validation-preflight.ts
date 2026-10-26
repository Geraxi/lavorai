import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const req = createRequire(resolve('src/lib/ordinary-validation-preflight.ts'));
const userId='cmvnz41b9pvoty0ufujkkx0zw';
const email='email-test-20261025@lavorai.it';
const now=new Date();
let reads=0, admin=true, user:any, apps:any[]=[], inbox:any=null, weekly=0;
Object.assign(process.env,{APPLICATIONS_PAUSED:'true',USER_NOTIFICATIONS_HOLD:'true',ATS_TEST_REAL_SUBMIT:'false',APPLICATION_SENDING_MODE:'automatic'});
delete process.env.INBOUND_EMAIL_DOMAIN; delete process.env.INBOUND_ROUTE_ATS_EMAIL;
globalThis.fetch=async()=>{throw new Error('provider access forbidden');};
function model(methods:Record<string,Function>) {
 return new Proxy(methods,{get(target,key){assert.equal(typeof key,'string');assert.ok(key in target,'unexpected DB operation: '+String(key));return (...args:any[])=>{reads++;return target[key as string](...args);};}});
}
const db={
 user:model({findUnique:async(a:any)=>{assert.equal(a.where.id,userId);return user;}}),
 application:model({findMany:async(a:any)=>{assert.equal(a.where.userId,userId);assert.equal(a.where.job.url,'https://produzioneweb.recruitee.com/o/lavorai-test-ordinary-validation');return apps;},count:async(a:any)=>JSON.stringify(a).includes('submittedAt')?weekly:0}),
 userInbox:model({findUnique:async()=>inbox}),
 cVDocument:model({count:async()=>1}),
 applicationSubmissionReservation:model({count:async()=>0}),
};
function mock(path:string,exports:any){const id=req.resolve(path);req.cache[id]={id,filename:id,loaded:true,exports} as any;}
mock('./db',{prisma:db});
mock('./session',{getCurrentUser:async()=>admin?{email:'umbertogeraci0@gmail.com'}:null});
const {ordinaryValidationPreflight}=req('./ordinary-validation-preflight');
const {GET}=req('../app/api/admin/ordinary-validation/preflight/route');
const {NextRequest}=req('next/server');
async function main(){
 user={email,name:'LavorAI Email Test',tier:'free',createdAt:now,subscriptionStatus:null,currentPeriodEnd:null,pausedUntil:null,suspendedAt:null,emailVerified:now,privacyConsentAt:now,avoidCompanies:null,preferences:{autoApplyMode:'manual',dailyCap:5},cvProfile:{firstName:'LavorAI',lastName:'Test',email,phone:'synthetic-phone'}};
 let r=await ordinaryValidationPreflight(db,now);
 assert.equal(r.status,'unknown');assert.equal(r.account.freeQuotaApplies,true);
 assert.equal(r.recipient.address,email);assert.equal(r.recipient.ownership,'unverified');
 assert.equal(r.profile.contentVerifiedSynthetic,'unknown');
 process.env.INBOUND_EMAIL_DOMAIN='inbound.example.test';
 r=await ordinaryValidationPreflight(db,now);assert.equal(r.recipient.address,null);assert.equal(r.recipient.source,'application_id_required');
 inbox={address:'owned@apply.example.test',disabledAt:null};
 r=await ordinaryValidationPreflight(db,now);assert.equal(r.recipient.address,inbox.address);
 inbox.disabledAt=now;
 r=await ordinaryValidationPreflight(db,now);assert.equal(r.recipient.address,null);
 user.privacyConsentAt=null;
 r=await ordinaryValidationPreflight(db,now);assert.ok(r.blockers.includes('privacy_consent_missing'));
 apps=[{id:'ordinary_fixture',userId,jobId:'owned-job',createdAt:now,consentGrantedAt:now,retryCount:0,status:'queued',startedAt:null,submitStartedAt:null,submittedAt:null,submitConfirmation:null,sessionId:null,session:null,user,job:{url:'https://produzioneweb.recruitee.com/o/lavorai-test-ordinary-validation',company:'ProduzioneWeb',closedAt:null}}];
 r=await ordinaryValidationPreflight(db,now);assert.ok(r.blockers.includes('privacy_consent_missing'));assert.equal(r.recipient.address,'reply+ordinary_fixture@inbound.example.test');
 user.privacyConsentAt=now;
 r=await ordinaryValidationPreflight(db,now);assert.equal(r.status,'unknown');assert.equal(r.application.id,'ordinary_fixture');
 apps[0].submitConfirmation='UNCONFIRMED';r=await ordinaryValidationPreflight(db,now);assert.ok(r.blockers.includes('application_not_fresh'));
 apps=[];user.privacyConsentAt=null;
 user.subscriptionStatus='paused';
 r=await ordinaryValidationPreflight(db,now);assert.ok(r.blockers.includes('subscription_paused'));
 user.email='different@example.test';
 r=await ordinaryValidationPreflight(db,now);assert.equal(r.reason,'test_account_identity_mismatch');
 user.email=email;user.subscriptionStatus=null;user.privacyConsentAt=now;
 weekly=999; r=await ordinaryValidationPreflight(db,now);assert.ok(r.blockers.includes('free_weekly_quota_reached'));weekly=0;
 const url='https://lavorai.it/api/admin/ordinary-validation/preflight';
 admin=false;let before=reads;assert.equal((await GET(new NextRequest(url))).status,403);assert.equal(reads,before);
 admin=true;assert.equal((await GET(new NextRequest(url+'?userId=other'))).status,400);assert.equal(reads,before);
 const response=await GET(new NextRequest(url));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 const body=await response.json();assert.equal(body.status,'unknown');
 assert.ok(!JSON.stringify(body).includes('synthetic-phone'));
 assert.ok(!('profileContents' in body));
 assert.equal(process.env.APPLICATIONS_PAUSED,'true');assert.equal(process.env.USER_NOTIFICATIONS_HOLD,'true');assert.equal(process.env.ATS_TEST_REAL_SUBMIT,'false');
 console.log('PASS fixed-scope preflight: real quota/routing helpers, auth, no parameters, unknown ownership, no DB writes/provider calls/sends');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
