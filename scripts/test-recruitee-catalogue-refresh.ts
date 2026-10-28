import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyRecruiteeForm,canonicalRecruiteeOffer} from '../src/lib/recruitee-form-capability';
import {inspectRecruiteeOffer,refreshTenants} from '../src/lib/recruitee-catalogue-refresh';
import {recruiteeAdapter} from '../src/lib/portal-adapters/recruitee';
const standard={id:1,status:'published',options_cv:'required',open_questions:[]};
assert.equal(classifyRecruiteeForm(standard),'standard');
for(const kind of ['text','boolean','multi_choice','salary','date','legal'])assert.equal(classifyRecruiteeForm({...standard,open_questions:[{required:true,kind}]}),'questions');
for(const kind of ['video','file','photo'])assert.equal(classifyRecruiteeForm({...standard,open_questions:[{required:true,kind}]}),'unsupported');
assert.equal(classifyRecruiteeForm({...standard,options_photo:'required'}),'unsupported');
assert.equal(classifyRecruiteeForm({status:'published'}),'unknown');
assert.equal(classifyRecruiteeForm({...standard,open_questions:[{kind:'text',required:'true'}]}),'unknown');
assert.equal(classifyRecruiteeForm({...standard,status:'closed'}),'closed');
assert.equal(canonicalRecruiteeOffer('https://evil.test/o/a'),null);
assert.throws(()=>refreshTenants(''));assert.throws(()=>refreshTenants('owned,evil.test'));
async function main(){
 let calls=0;
 const fake=(status:number,body:unknown)=>async(_url:unknown,init:RequestInit|undefined)=>{assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');calls++;return new Response(JSON.stringify(body),{status})};
 for(const status of [404,410])assert.equal((await inspectRecruiteeOffer('https://owned.recruitee.com/o/a',fake(status,{}) as typeof fetch)).capability,'closed');
 for(const status of [429,500,403])assert.equal((await inspectRecruiteeOffer('https://owned.recruitee.com/o/a',fake(status,{}) as typeof fetch)).capability,null);
 assert.equal((await inspectRecruiteeOffer('https://owned.recruitee.com/o/a',fake(200,{offer:standard}) as typeof fetch)).capability,'standard');
 assert.equal((await inspectRecruiteeOffer('https://owned.recruitee.com/o/a',fake(200,{offer:{...standard,id:null}}) as typeof fetch)).capability,'unknown');
 const old=fetch;process.env.APPLICATION_PROVIDER_POLICY='recruitee_only';process.env.APPLICATION_PROVIDER_NOT_BEFORE='2026-10-27T23:16:58.626Z';
 let posts=0;globalThis.fetch=async(_url,init)=>{if(init?.method==='POST')posts++;return new Response(JSON.stringify({offer:{...standard,open_questions:[{required:true,kind:'text',body:'Changed after refresh'}]}}))};
 try{const result=await recruiteeAdapter.apply(null as never,{jobUrl:'https://owned.recruitee.com/o/a',profile:{}} as never);assert.equal(result.refusedBeforeSubmit,true);assert.equal(posts,0);}finally{globalThis.fetch=old;delete process.env.APPLICATION_PROVIDER_POLICY;delete process.env.APPLICATION_PROVIDER_NOT_BEFORE;}
 const route=readFileSync('src/app/api/cron/recruitee-catalogue/route.ts','utf8');assert.match(route,/CRON_SECRET/);assert.match(route,/REFRESH_ENABLED!=='true'/);
 const mcp=readFileSync('src/app/api/mcp/route.ts','utf8');assert.match(mcp,/where: \{ id, AND: \[catalogueWhere\(\)\] \}/);
 assert.equal(calls,7);console.log('PASS standard-only form capability, GET-only bounded inspection, transient vs authoritative closure, live requirements change refuses before any POST, auth/default-off schedule and direct MCP gate');
}
main().catch(e=>{console.error(e);process.exitCode=1});
