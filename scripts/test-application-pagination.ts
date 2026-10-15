import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { InvalidApplicationCursor, listApplications } from "../src/lib/application-list";
import { applicationDeliveryView } from "../src/lib/application-delivery-view";
import { pipelineLane } from "../src/lib/application-pipeline";
import { APPLICATION_LANES } from "../src/lib/application-pagination";

const now = new Date("2026-10-15T12:00:00Z");
const receipt = JSON.stringify({ version: 1, provider: "greenhouse", kind: "dom", capturedAt: now.toISOString(), jobId: "123", signal: "new_receipt_and_form_removed" });
const records = Array.from({length: 723}, (_, i) => ({
  id: `app-${String(i).padStart(4,"0")}`, userId: "owner", createdAt: new Date(now.getTime() - Math.floor(i / 3) * 3600_000),
  status: i % 11 === 0 ? "awaiting_consent" : "success", portal: "greenhouse", userStatus: i % 6 === 3 ? "colloquio" : i % 6 === 4 ? "offerta" : null,
  submittedVia: i % 6 === 5 ? "manual" : "portal_greenhouse", submitConfirmation: null,
  submissionReceiptJson: i % 6 === 0 ? receipt : i % 6 === 1 ? "{malformed" : null,
  lastReplyKind: i % 6 === 2 ? "risposta" : null,
  emailAttempts: i % 17 === 0 ? [{id:'email',createdAt:now,status:"bounced", providerEmailId:"proof",acceptedAt:now,recipient:"recruiter@example.test"}] : [],
  job: {id:"job-"+i,title:`Engineer ${i}`,company:i % 7 === 0 ? "Needle company" : "Example",location:"Milano",source:"greenhouse",url:"https://example.test"},
  errorMessage: null, atsScore: null, suggestionsJson: i === 1 ? "bad-json" : "[]", completedAt: null,
  coverLetterText: "Large body deliberately excluded from evidence scans".repeat(50), cvDocxPath: null, coverLetterPath: null, cvPdfPath:null,
  cvLanguage:"it",viewedAt:null,submittedAt:null,lastReplyAt:null,replyCount:0,
}));
records.push({...records[0],id:"foreign",userId:"another-user"}, {...records[0],id:"diagnostic",status:"diagnostic"});
let activeRecords = records;
const calls: any[] = [];
function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (key === "AND") return value.every((w:any)=>matches(row,w));
    if (key === "OR") return value.some((w:any)=>matches(row,w));
    const actual=row[key];
    if (value instanceof Date) return actual instanceof Date && +actual === +value;
    if (value && typeof value === "object") {
      if (key === "job") return matches(actual,value);
      return Object.entries(value).every(([op,v]:[string,any]) => op === "not" ? actual !== v : op === "in" ? v.includes(actual) : op === "gte" ? actual >= v : op === "lt" ? actual < v : op === "lte" ? actual <= v : op === "contains" ? String(actual ?? '').toLowerCase().includes(v.toLowerCase()) : op === "mode");
    }
    return actual === value;
  });
}
function project(row: any, select: any): Record<string, any> { return Object.fromEntries(Object.entries(select).map(([key, value]:[string,any])=>[key, value === true ? row[key] : Array.isArray(row[key]) ? row[key].slice(0,value.take).map((r:any)=>project(r,value.select)) : project(row[key],value.select)])); }
const db = { application: {
  async findMany(query:any) {
    calls.push(query);
    assert.ok(query.take > 0 && query.take <= 100,"Every DB read is bounded");
    let rows=activeRecords.filter(r=>matches(r,query.where));
    if(query.orderBy) rows.sort((a,b)=>+b.createdAt-+a.createdAt || b.id.localeCompare(a.id));
    return rows.slice(0,query.take).map(r=>project(r,query.select));
  },
  async findFirst(query:any) { calls.push(query); const row=activeRecords.find(r=>matches(r,query.where));return row?project(row,query.select):null; },
  async count(query:any) { calls.push(query);return activeRecords.filter(r=>matches(r,query.where)).length; },
}} as unknown as Pick<PrismaClient,"application">;
const eligible=records.filter(r=>r.userId==='owner'&&r.status!=='diagnostic').sort((a,b)=>+b.createdAt-+a.createdAt||b.id.localeCompare(a.id));
const stage=(r:typeof records[number])=>pipelineLane({...r,delivery:applicationDeliveryView(r)});
const request = (query: string) => listApplications(db,"owner",new URLSearchParams("includeAll=1&"+query),now) as Promise<any>;

async function main() {
  const first=await request('view=board');
  assert.equal(first.total,723);
  assert.equal(first.applications.length,12);
  assert.equal(first.awaitingCount,eligible.filter(r=>r.status==='awaiting_consent').length);
  for(const lane of APPLICATION_LANES) {
    const all=eligible.filter(r=>stage(r)===lane);
    assert.equal(first.lanes[lane].total,all.length);
    const seen:string[]=[];
    for(let page=1;page<=Math.ceil(all.length/3);page++) {
      const response=await request(`view=board&lane=${lane}&${lane}Page=${page}`);
      assert.equal(response.applications.length,Math.min(3,all.length-seen.length));
      seen.push(...response.applications.map((r:any)=>r.id));
    }
    assert.deepEqual(seen,all.map(r=>r.id),`${lane}: all pages accessible exactly once`);
    const last=await request(`view=board&lane=${lane}&${lane}Page=999999`);
    assert.equal(last.lanes[lane].page,last.lanes[lane].pageCount);
    assert.deepEqual(last.applications.map((r:any)=>r.id),all.slice((last.lanes[lane].page-1)*3).map(r=>r.id));
  }
  const table=await request('view=table&page=2');
  assert.deepEqual(table.applications.map((r:any)=>r.id),eligible.slice(10,20).map(r=>r.id));
  const filtered=await request('view=table&search=NEEDLE&page=999');
  assert.equal(filtered.total,eligible.filter(r=>r.job.company==='Needle company').length);
  assert.ok(filtered.applications.every((r:any)=>r.job.company==='Needle company'));
  const range=await request('view=table&range=today');
  assert.equal(range.total,eligible.filter(r=>+r.createdAt>=+new Date(now.getFullYear(), now.getMonth(), now.getDate())).length);
  const pending=await request('view=attention&page=2');
  assert.equal(pending.applications.length,3);
  assert.ok(pending.applications.every((r:any)=>!["confirmed","delivered","manual"].includes(r.delivery.phase)));
  assert.equal((await request('view=table&pageSize=9999')).applications.length,50);
  assert.equal((await request('view=table&page=-4&pageSize=-1')).pagination.page,1);
  const none=await request('view=board&search=no-such-company');
  assert.equal(none.total,0);assert.deepEqual(none.applications,[]);
  assert.equal((await request('id=app-0700')).applications[0].id,'app-0700');
  assert.deepEqual((await request('id=foreign')).applications,[]);
  assert.deepEqual((await request('id=diagnostic')).applications,[]);
  const exported=await request('view=export');
  assert.equal(exported.applications.length,50);
  assert.ok(exported.nextCursor);
  // Inserts above the cursor and deletions above it must not shift later rows.
  activeRecords=[{...records[0],id:'new-after-export',createdAt:new Date(now.getTime()+1000)},...records.filter(r=>r.id!==eligible[0].id)];
  const second=await request('view=export&cursor='+encodeURIComponent(exported.nextCursor));
  assert.deepEqual(second.applications.map((r:any)=>r.id),eligible.slice(50,100).map(r=>r.id));
  const exportedIds=exported.applications.map((r:any)=>r.id);
  let cursor=exported.nextCursor;
  while(cursor) { const next=await request('view=export&cursor='+encodeURIComponent(cursor));exportedIds.push(...next.applications.map((r:any)=>r.id));cursor=next.nextCursor; }
  assert.deepEqual(exportedIds,eligible.map(r=>r.id),'Stable export includes original order once despite inserts/deletions before boundary');
  await assert.rejects(request('view=export&cursor=not-a-cursor'),InvalidApplicationCursor);
  activeRecords=[];
  const empty=await request('view=table&page=50');assert.equal(empty.pagination.page,1);assert.equal(empty.total,0);
  activeRecords=records;
  for(const query of calls.filter(q=>q.select)) {
    assert.ok(JSON.stringify(query.where).includes('"userId":"owner"'),"Ownership on every query");
    if(!query.select.job) { assert.equal(query.select.coverLetterText,undefined); assert.equal(query.select.suggestionsJson,undefined); }
    else if(query.take) assert.ok(query.take<=50,"Only current-page details loaded");
  }
  let signedIn=false;
  const module={exports:{} as any};
  const code=ts.transpileModule(readFileSync('src/app/api/applications/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:(id:string)=>({
    'next/server':{NextResponse},'@/lib/db':{prisma:db},'@/lib/session':{getCurrentUser:async()=>signedIn?{id:'owner'}:null},'@/lib/application-list':{listApplications,InvalidApplicationCursor},
  }[id])});
  const req=new NextRequest('http://localhost/api/applications?view=board&includeAll=1');
  assert.equal((await module.exports.GET(req)).status,401);
  signedIn=true;const response=await module.exports.GET(req);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal((await response.json()).applications.length,12);
  console.log('PASS: 723 owned applications, all stage pages exactly once, table/filter/range/empty transitions, evidence parity, last-page clamping, bounded detail reads, concurrent CSV inserts/deletions, deep links and ownership/auth. No database/network writes.');
}
main();
