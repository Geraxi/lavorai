/** Real isolated localhost DB + mocked provider. Refuses non-test DBs and external fetch. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as policy from "../src/lib/inbox-reply-policy";
import { isApplicationVerificationMessage } from "../src/lib/reply-security-message";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/inbox_replies_test"); assert.equal(url.port, "55438");
const prisma = new PrismaClient();
process.env.RESEND_API_KEY = "re_mock_never_sent";
process.env.INBOUND_EMAIL_DOMAIN = "inbound.example.test";
process.env.RESEND_FROM_OVERRIDE = "LavorAI <sender@example.test>";
process.env.APPLICATIONS_PAUSED = "false";
process.env.RESEND_DAILY_LIMIT = "95";
process.env.RESEND_MONTHLY_LIMIT = "2900";
let sent: Array<{ body: any; options: any }> = []; let mode = "accept"; let sessionId: string | null = "inbox-owner"; let providerFetch = 0;
function load(path: string, dependencies: Record<string, unknown>, extras = {}) {
  const result = ts.transpileModule(readFileSync(path,"utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(result, { module, exports:module.exports, require(id:string) { assert.ok(id in dependencies, `Unexpected module ${id}`); return dependencies[id]; }, console, Date, URL, Buffer, process, AbortSignal, ...extras }, { filename:path }); return module.exports;
}
const delivery = load("src/lib/application-delivery.ts", { "@/lib/db": { prisma } });
const inboundIds = (to: string[] | string, domain: string) => (Array.isArray(to) ? to : [to]).flatMap(address => address === `reply+inbox-app@${domain}` ? ["inbox-app"] : []);
const service = load("src/lib/inbox-replies.ts", {
  "node:crypto": { randomUUID }, "resend": { Resend: class { emails = { send: async(body:any,options:any) => { sent.push({body,options}); if(mode === "throw") throw new Error("Network ambiguity"); if(mode === "quota") return {error:{name:"daily_quota_exceeded",message:"Daily quota exceeded",statusCode:429}}; if(mode === "race") await service.recordInboxReplyEvent({providerEmailId:"provider-race",type:"email.delivered",occurredAt:new Date(),replyId:body.tags[0].value,recipients:[body.to]}); return { data:{id:mode === "race" ? "provider-race" : "provider-"+body.tags[0].value} }; } }; } },
  "@/lib/db": { prisma }, "@/lib/application-delivery":delivery,
  "@/lib/email": { inboundReplyAddress: (id:string) => `reply+${id}@inbound.example.test` },
  "@/lib/application-pause": { applicationsPaused:()=>process.env.APPLICATIONS_PAUSED !== "false" },
  "@/lib/reply-security-message": { isApplicationVerificationMessage }, "@/lib/inbox-reply-policy":policy,
  "@/lib/application-reply-processing": { inboundApplicationIds:inboundIds },
}, { fetch: async()=> {providerFetch++; throw new Error("External network forbidden in test");} });
const api = load("src/app/api/inbox/replies/route.ts", {
  "next/server": {NextRequest,NextResponse},zod:{z},"@/lib/auth":{auth:async()=>sessionId?{user:{id:sessionId}}:null},
  "@/lib/db":{prisma},"@/lib/billing":{isApplicationAccessPaused:()=>false,requiresPaymentMethodBeforeApp:()=>false},"@/lib/admin":{isAdmin:()=>false},"@/lib/inbox-replies":service,"@/lib/inbox-reply-policy":policy,
});
const request = (data:unknown,origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/inbox/replies",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(data)});
const draft = () => ({id:randomUUID(),parentId:"application_reply:inbox-parent",body:"Thank you. Thursday works for me.",action:"draft"});
const expectCode = async (promise:Promise<unknown>,code:string) => {await assert.rejects(promise,(error:any)=>error.code===code)};
async function main() {
try {
  await prisma.user.createMany({data:[{id:"inbox-owner",email:"owner@example.test",name:"Alex Example"},{id:"inbox-other",email:"other@example.test"}],skipDuplicates:true});
  await prisma.job.upsert({where:{id:"inbox-job"},update:{},create:{id:"inbox-job",externalId:"inbox-fixture",description:"Synthetic test job",title:"Test Engineer",company:"Example Test",url:"https://example.test/jobs/1",source:"test"}});
  await prisma.application.upsert({where:{id:"inbox-app"},update:{},create:{id:"inbox-app",userId:"inbox-owner",jobId:"inbox-job",portal:"test",status:"success"}});
  await prisma.emailLog.deleteMany({where:{id:{startsWith:"inbox-reply:"}}});
  await prisma.inboxReply.deleteMany({where:{applicationId:"inbox-app"}});
  await prisma.applicationReply.upsert({where:{id:"inbox-parent"},update:{},create:{id:"inbox-parent",applicationId:"inbox-app",fromAddress:"Recruiter <recruiter@example.test>",subject:"Interview\r\nBcc: injection@example.test",bodyText:"Let's arrange a call",kind:"colloquio",directRecipient:true,rfcMessageId:"<thread@sender.test>",replyToAddress:"recruiter@example.test",referencesHeader:"<earlier@sender.test> <thread@sender.test>"}});
  assert.equal(policy.singleMailbox("one@example.test, two@example.test"),null);assert.equal(policy.singleMailbox("X <one@example.test>\r\nBcc: two@example.test"),null);assert.equal(policy.messageId("<bad>\r\nBcc:x"),null);
  assert.equal(policy.replyMetadata({from:"a@example.test",message_id:"<id@example.test>",headers:{"Reply-To":"reply@example.test",References:"<old@example.test>"}}).replyToAddress,"reply@example.test");
  assert.equal(policy.replyMetadata({from:"a@example.test",headers:{"Reply-To":"a@example.test,b@example.test"}}).replyToAddress,null);
  await expectCode(service.getReplyContext("inbox-other","application_reply:inbox-parent"),"message_unavailable");
  await expectCode(service.getReplyContext("inbox-owner","gmail:any"),"gmail_read_only");
  const a = draft(); let response=await api.POST(request({...a,recipient:"attacker@example.test"}));assert.equal(response.status,400);assert.equal(sent.length,0);
  response=await api.POST(request(a,"https://evil.test"));assert.equal(response.status,403);
  sessionId=null;response=await api.POST(request(a));assert.equal(response.status,401);sessionId="inbox-owner";
  response=await api.POST(request(a));assert.equal(response.status,200);assert.equal(sent.length,0,"Saving draft must not send");
  const saved=await prisma.inboxReply.findUniqueOrThrow({where:{id:a.id}});assert.equal(saved.recipient,"recruiter@example.test");assert.ok(!saved.subject.includes("\n"));
  await expectCode(service.sendInboxReply("inbox-other",a.id),"message_unavailable");
  const both=await Promise.all([service.sendInboxReply("inbox-owner",a.id),service.sendInboxReply("inbox-owner",a.id)]);assert.equal(sent.length,1,"Concurrent send must submit once");
  assert.equal((await prisma.inboxReply.findUniqueOrThrow({where:{id:a.id}})).status,"accepted");assert.ok(both.some(row=>row.status==="accepted"));
  assert.equal(sent[0].body.headers["In-Reply-To"],"<thread@sender.test>");assert.equal(sent[0].body.headers.References,"<earlier@sender.test> <thread@sender.test>");assert.equal(sent[0].body.replyTo,"reply+inbox-app@inbound.example.test");assert.equal(sent[0].options.idempotencyKey,`inbox-reply/${a.id}`);
  await service.sendInboxReply("inbox-owner",a.id);assert.equal(sent.length,1);
  assert.equal(await prisma.emailLog.count({where:{id:`inbox-reply:${a.id}`}}),1,"Shared quota ledger records acceptance once");
  await expectCode(service.saveInboxDraft("inbox-owner",{...a,body:"Changed payload"}),"reply_already_submitted");
  await service.recordInboxReplyEvent({providerEmailId:`provider-${a.id}`,type:"email.delivered",occurredAt:new Date("2026-10-15T20:00:00Z"),recipients:[]});
  await service.recordInboxReplyEvent({providerEmailId:`provider-${a.id}`,type:"email.sent",occurredAt:new Date("2026-10-15T19:00:00Z"),recipients:[]});assert.equal((await prisma.inboxReply.findUniqueOrThrow({where:{id:a.id}})).status,"delivered");
  const b=draft();await service.saveInboxDraft("inbox-owner",b);mode="throw";await service.sendInboxReply("inbox-owner",b.id);assert.equal((await prisma.inboxReply.findUniqueOrThrow({where:{id:b.id}})).status,"unknown");const key=sent.at(-1)!.options.idempotencyKey;mode="accept";await service.sendInboxReply("inbox-owner",b.id);assert.equal(sent.at(-1)!.options.idempotencyKey,key);
  const c=draft();await service.saveInboxDraft("inbox-owner",c);mode="quota";const failed=await service.sendInboxReply("inbox-owner",c.id);assert.equal(failed.status,"failed");assert.equal(failed.failureCode,"email_quota_reached");assert.equal(failed.bodyText,c.body);
  const d=draft();await service.saveInboxDraft("inbox-owner",d);mode="race";const raced=await service.sendInboxReply("inbox-owner",d.id);assert.equal(raced.status,"delivered","Acceptance must not overwrite racing delivery event");
  const e=draft();await service.saveInboxDraft("inbox-owner",e);process.env.APPLICATIONS_PAUSED="true";await expectCode(service.sendInboxReply("inbox-owner",e.id),"sending_paused");process.env.APPLICATIONS_PAUSED="false";
  process.env.RESEND_DAILY_LIMIT="1";await expectCode(service.sendInboxReply("inbox-owner",e.id),"email_quota_reached");assert.equal((await prisma.inboxReply.findUniqueOrThrow({where:{id:e.id}})).status,"draft");process.env.RESEND_DAILY_LIMIT="95";
  await prisma.inboxReply.update({where:{id:e.id},data:{status:"unknown",firstAttemptAt:new Date(Date.now()-24*3600000)}});await expectCode(service.sendInboxReply("inbox-owner",e.id),"send_status_unknown");
  const invalid=await api.POST(request({...draft(),body:"x".repeat(17000)}));assert.equal(invalid.status,413);
  await prisma.applicationReply.update({where:{id:"inbox-parent"},data:{isSecurityCode:true}});await expectCode(service.getReplyContext("inbox-owner","application_reply:inbox-parent"),"message_unavailable");await prisma.applicationReply.update({where:{id:"inbox-parent"},data:{isSecurityCode:false}});

  const deletable=draft();await service.saveInboxDraft("inbox-owner",deletable);
  const remove=()=>new NextRequest(`http://localhost:3000/api/inbox/replies?id=${deletable.id}`,{method:"DELETE",headers:{origin:"http://localhost:3000"}});
  sessionId="inbox-other";assert.equal((await api.DELETE(remove())).status,404);sessionId="inbox-owner";assert.equal((await api.DELETE(remove())).status,200);assert.equal(await prisma.inboxReply.findUnique({where:{id:deletable.id}}),null);
  const unknown=draft();await service.saveInboxDraft("inbox-owner",unknown);mode="throw";await service.sendInboxReply("inbox-owner",unknown.id);
  const wrong=await service.recordInboxReplyEvent({providerEmailId:"wrong-provider",type:"email.delivered",occurredAt:new Date(),replyId:unknown.id,recipients:["wrong@example.test"]});assert.equal(wrong,false);
  assert.equal((await prisma.inboxReply.findUniqueOrThrow({where:{id:unknown.id}})).status,"unknown");
  await prisma.inboxReply.updateMany({where:{applicationId:"inbox-app",firstAttemptAt:{not:null}},data:{firstAttemptAt:new Date()}});
  const existingCount=await prisma.inboxReply.count({where:{applicationId:"inbox-app",firstAttemptAt:{not:null}}});
  for(let i=existingCount;i<10;i++){const row=await service.saveInboxDraft("inbox-owner",draft());await prisma.inboxReply.update({where:{id:row.id},data:{firstAttemptAt:new Date(),status:"failed"}})}
  const limited=await service.saveInboxDraft("inbox-owner",draft());await expectCode(service.sendInboxReply("inbox-owner",limited.id),"reply_rate_limited");
  assert.equal(providerFetch,0);console.log('[inbox-replies-postgres] PASS: real migration + ownership, CSRF, strict payload, no automatic send, recipient/thread routing, concurrency, immutable idempotency, unknown retry expiry, provider quota, pause, racing/out-of-order delivery, security-code exclusion. Provider fully mocked.');
} finally { await prisma.$disconnect(); }

}
main().catch(error => { console.error(error); process.exitCode=1; });
