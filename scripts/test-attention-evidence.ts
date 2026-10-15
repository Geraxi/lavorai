import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applicationTimeline } from "../src/lib/application-timeline";
import { explainMatch } from "../src/lib/match-explanation";
import { EMPTY_PROFILE } from "../src/lib/cv-profile-types";
import { messageNeedsAttention } from "../src/lib/attention";
import type { InboxMessage } from "../src/lib/inbox-message";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ActivationEvidence } from "../src/components/activation-evidence";
function load(path: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as any };
  vm.runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module,exports:module.exports,require:(id:string)=>{assert.ok(id in dependencies,id);return dependencies[id]},Date,Map,Set,URL,Buffer,console});
  return module.exports;
}
const now = new Date("2026-10-15T12:00:00Z");
const app = { status:"success",submittedVia:"email_recruiter",submitConfirmation:"EMAIL_SENT",emailAttempts:[{status:"accepted",providerEmailId:"p",acceptedAt:now}],replies:[],gmailMessages:[] };
assert.equal(applicationTimeline(app)[1].at, now.toISOString());
assert.equal(applicationTimeline(app)[2].state,"pending");
assert.equal(applicationTimeline({...app,emailAttempts:[{...app.emailAttempts[0],status:"delivered"} ]})[2].at,null,"Delivery without event timestamp is unknown, not acceptance time");
assert.equal(applicationTimeline({...app,emailAttempts:[{...app.emailAttempts[0],status:"bounced",events:[{type:"email.delivered",occurredAt:now}]}]})[2].state,"problem","Later bounce cannot be masked by historical delivery");
assert.equal(applicationTimeline({...app,emailAttempts:[]})[1].state,"unknown","Legacy success is not evidence");
assert.equal(applicationTimeline({...app,cvPdfPath:"synthetic.pdf"})[0].at,null,"Document availability is not a preparation timestamp");
assert.equal(applicationTimeline({...app,coverLetterText:"Prepared letter"})[0].state,"observed","Text-only materials are preparation evidence");
assert.equal(applicationTimeline({...app,status:"diagnostic",replies:[{receivedAt:now}]})[3].state,"unknown");
assert.equal(applicationTimeline({...app,replies:[{receivedAt:now}]})[3].at,now.toISOString());
const msg = {id:"application_reply:m",source:"application_reply",applicationId:"a",date:now.toISOString(),kind:"risposta",jobRelated:true,isHuman:true,read:false} as InboxMessage;
assert.ok(messageNeedsAttention(msg,[],now));
assert.ok(messageNeedsAttention({...msg,read:true},[],now),"Read does not mean answered");
assert.ok(messageNeedsAttention({...msg,read:null},[],now),"Historical read state remains actionable without claiming unread");
for (const status of ["unknown","failed","draft","bounced","sending"]) assert.ok(messageNeedsAttention(msg,[{applicationId:"a",parentReplyId:"m",status,acceptedAt:now,createdAt:now}],now));
assert.ok(!messageNeedsAttention(msg,[{applicationId:"a",parentReplyId:"m",status:"accepted",acceptedAt:now,createdAt:now}],now));
assert.ok(messageNeedsAttention({...msg,source:"gmail"},[{applicationId:"a",parentReplyId:"m",status:"accepted",acceptedAt:now,createdAt:now}],now),"External Gmail replies aren't inferred from another channel");
assert.ok(!messageNeedsAttention({...msg,handledAt:now.toISOString()},[],now));
assert.ok(!messageNeedsAttention({...msg,remindAt:new Date(+now+1000).toISOString()},[],now));
assert.ok(messageNeedsAttention({...msg,remindAt:new Date(+now-1000).toISOString()},[],now));
assert.ok(!messageNeedsAttention({...msg,isHuman:false},[],now));
assert.ok(!messageNeedsAttention({...msg,kind:"ricevuta"},[],now));
const explained=explainMatch({...EMPTY_PROFILE,skills:[{name:"React"}]},"React experience required. Must know Python. We welcome every applicant.");
assert.deepEqual(explained.matchedSkills,["React"]);assert.deepEqual(explained.missingEvidence,["Python"]);
assert.deepEqual(explainMatch(EMPTY_PROFILE,"Python is not required. React required, Python preferred.").missingEvidence, [], "Negated and preferred skills are not missing requirements");
assert.equal(explainMatch(null,"Python required.").missingEvidence.length,0);
assert.equal(explainMatch(EMPTY_PROFILE,"Preferred: Python. Must know JavaScript.").missingEvidence.includes("Java"),false,"Token boundaries avoid invented Java requirement");
assert.equal(explainMatch(EMPTY_PROFILE,"No stated requirements").requirements.length,0,"An explicit absence is not a job requirement");

async function main() {
 let owner:string|null="owner",paused=false,payment=false,suspended=false,fail=false; const mutations:any[]=[];
 const prisma={user:{findUnique:async()=>owner?{id:owner,email:"member@example.test",suspendedAt:suspended?now:null}:null},
  applicationReply:{updateMany:async(q:any)=>{mutations.push(q);if(fail)throw Error();return {count:q.where.id==="owned"&&q.where.application.userId==="owner"?1:0}}},
  gmailMessage:{updateMany:async(q:any)=>{mutations.push(q);return {count:q.where.id==="owned"&&q.where.userId==="owner"?1:0}}},
  job:{findUnique:async(q:any)=>q.where.id==="job"?{id:"job"}:null},jobDismissal:{upsert:async(q:any)=>{mutations.push(q)},deleteMany:async(q:any)=>{mutations.push(q);return {count:1}}}};
 const shared=load("src/lib/workspace-mutation.ts",{"next/server":{NextResponse},"@/lib/auth":{auth:async()=>owner?{user:{id:owner}}:null},"@/lib/db":{prisma},"@/lib/admin":{isAdmin:()=>false},"@/lib/billing":{isApplicationAccessPaused:()=>paused,requiresPaymentMethodBeforeApp:()=>payment}});
 const deps={"next/server":{NextResponse},zod:{z},"@/lib/db":{prisma},"@/lib/workspace-mutation":shared};
 const attention=load("src/app/api/inbox/attention/route.ts",deps), dismiss=load("src/app/api/jobs/dismissals/route.ts",deps);
 const request=(data:unknown,origin="http://localhost")=>new NextRequest("http://localhost/api/test",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(data)});
 for (const route of [attention,dismiss]) { owner=null;assert.equal((await route.POST(request({}))).status,401);owner="owner";paused=true;assert.equal((await route.POST(request({}))).status,403);paused=false;suspended=true;assert.equal((await route.POST(request({}))).status,403);suspended=false;payment=true;assert.equal((await route.POST(request({}))).status,403);payment=false;assert.equal((await route.POST(request({},"https://evil.test"))).status,403); }
 assert.equal(mutations.length,0,"Denied requests cannot mutate");
 assert.equal((await attention.POST(request({id:"application_reply:foreign",action:"handled"}))).status,404);
 assert.equal((await attention.POST(request({id:"application_reply:owned",action:"read",userId:"other"}))).status,400);
 assert.equal((await attention.POST(request({id:"application_reply:owned",action:"tomorrow"}))).status,200);
 assert.equal(mutations.at(-1).where.isSecurityCode,false);
 assert.ok(mutations.at(-1).data.remindAt>Date.now());
 assert.equal((await attention.POST(request({id:"gmail:owned",action:"read"}))).status,200);
 assert.deepEqual(Object.keys(mutations.at(-1).data),["read"]);
 fail=true;assert.equal((await attention.POST(request({id:"application_reply:owned",action:"read"}))).status,503);fail=false;
 assert.equal((await dismiss.POST(request({jobId:"job",action:"dismiss"}))).status,200);assert.equal(mutations.at(-1).create.userId,"owner");
 assert.equal((await dismiss.POST(request({jobId:"job",action:"restore"}))).status,200);assert.equal(mutations.at(-1).where.userId,"owner");
 assert.equal((await dismiss.POST(request({jobId:"missing",action:"dismiss"}))).status,404);
 assert.equal((await dismiss.POST(request({jobId:"x".repeat(2000),action:"dismiss"}))).status,413);
 const onboarding=load("src/lib/onboarding.ts",{"@/lib/db":{prisma:{cVDocument:{count:async()=>0},userPreferences:{findUnique:async()=>({rolesJson:'[""]'})},user:{findUnique:async()=>({emailVerified:null})},conversionEvent:{findFirst:async()=>null}}},"@/lib/billing":{requiresPaymentMethodBeforeApp:()=>true,isApplicationAccessPaused:()=>false}});
 const state=await onboarding.getOnboardingState("owner");assert.equal(state.hasSetPreferences,false);assert.equal(state.hasUploadedCv,false);assert.equal(state.hasVerifiedEmail,false);assert.equal(state.paymentReady,false);assert.equal(state.cardConfirmedAt,null);
 const activation=load("src/lib/activation-evidence.ts",{"@/lib/db":{prisma:{}},"@/lib/admin":{isAdmin:(email:string)=>email==="admin@example.test",isTestAccount:()=>false},"@/lib/application-evidence":await import("../src/lib/application-evidence")});
 await assert.rejects(activation.loadActivationEvidence("member@example.test",{}),/Admin required/);
 const stages=activation.setupStages([{verified:true,cv:false,preferences:true,submitted:true,response:true},{verified:true,cv:true,preferences:true,submitted:false,response:false}]);
 assert.equal(stages[1].completed,1);assert.equal(stages[3].completed,0,"Sequential stage intersections, not unrelated count subtraction");
 assert.match(renderToStaticMarkup(createElement(ActivationEvidence,{metrics:null})),/non sono zero/);
 let recorded: any[] = [];
 const analytics=await import("../src/lib/analytics");
 const collector=load("src/app/api/analytics/event/route.ts",{"node:crypto":{randomBytes:()=>Buffer.from("synthetic")},"next/server":{NextResponse},"@/lib/auth":{auth:async()=>null},"@/lib/analytics":analytics,"@/lib/conversion-events":{recordConversionEvent:async(...args:any[])=>{recorded.push(args)}},"@/lib/rate-limit":{analyticsLimiter:{limit:async()=>({success:true})}}});
 for (const name of ["card_setup_confirmed","purchase_completed","subscription_started","first_application_delivered"]) await collector.POST(request({name,source:"stripe_verified"}));
 assert.equal(recorded.length,0,"Public collector cannot forge server evidence");
 await collector.POST(request({name:"google_login_failure_observed",source:"google_client_observation",payload:{stage:"callback_error"}}));assert.equal(recorded.length,1);
 console.log("PASS attention/read/handled/snooze, unknown send and Gmail ambiguity, evidence timestamps, match boundaries, empty onboarding/payment separation, auth/CSRF/ownership/outage, dismissal/restore and admin denial. No network or DB writes.");
}
main().catch(e=>{console.error(e);process.exitCode=1});
