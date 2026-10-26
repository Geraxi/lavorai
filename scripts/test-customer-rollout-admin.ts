import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {readReleaseSchema} from '../src/lib/customer-rollout-readiness';
import * as rollout from '../src/lib/customer-rollout';
const code=ts.transpileModule(readFileSync('src/app/api/admin/customer-rollout/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function main(){
 let admin=false,origin=true,reads=0,writes=0,reportFails=false;
 const db:any={$queryRaw:async()=>{reads++;return[{batch:'batch',grant:'grant'}];},applicationReleaseBatch:{findUnique:async()=>null,upsert:async()=>{writes++;}},application:{findMany:async()=>[]}};
 db.$transaction=async(run:any)=>run(db);
 const dependencies:Record<string,unknown>={
  '@/lib/csrf':{checkOrigin:()=>origin},'@/lib/session':{getCurrentUser:async()=>({email:'owner@example.test'})},'@/lib/admin':{isAdmin:()=>admin},'@/lib/db':{prisma:db},'@/lib/customer-rollout':rollout,'@/lib/customer-rollout-readiness':{customerReadiness:async()=>{reads++;if(reportFails)throw Object.assign(new Error('private DB details'),{code:'P2010'});return{schema:{compatible:true},candidates:[],activationAuthorized:false};}},'@/lib/deployed-version':{deployedAppVersion:()=> 'test-sha'},'next/server':{NextResponse:{json:(body:unknown,opts?:{status?:number})=>({body,status:opts?.status??200})}}
 };
 const module={exports:{} as any};
 vm.runInNewContext(code,{console:{error:()=>{}},module,exports:module.exports,process,require:(id:string)=>{assert.ok(id in dependencies,id);return dependencies[id];},fetch:()=>{throw Error('network forbidden');}});
 const api=module.exports;
 assert.equal((await api.GET()).status,403);assert.equal(reads,0);
 admin=true;assert.equal((await api.GET()).body.active,false);assert.equal(writes,0);
 const now=new Date();process.env.CUSTOMER_ROLLOUT_MANIFEST=JSON.stringify({batchId:'admin-test',startedAt:now.toISOString(),expiresAt:new Date(+now+900000).toISOString(),notBefore:now.toISOString(),maxAttempts:1,applications:[{applicationId:'app',userId:'user',jobId:'job',url:'https://owned.recruitee.com/o/role',recipient:'owner@example.test',createdAt:now.toISOString()}]});
 const request=(body:unknown)=>({json:async()=>body});
 origin=false;assert.equal((await api.POST(request({action:'stop',batchId:'admin-test'}))).status,403);assert.equal(writes,0);
 origin=true;for(const body of [{action:'enable',batchId:'admin-test'},{action:'stop',batchId:'other'},{action:'stop',batchId:'admin-test',send:true}])assert.equal((await api.POST(request(body))).status,400);
 assert.equal(writes,0);assert.equal((await api.POST(request({action:'stop',batchId:'admin-test'}))).status,200);assert.equal(writes,1);
 await api.GET();assert.equal(writes,1,'status GET never changes storage');
 reportFails=true;const failed=await api.GET();assert.equal(failed.status,503);assert.equal(failed.body.error,'readiness_unavailable');assert.equal(failed.body.active,false);assert.equal(failed.body.databaseErrorCode,'P2010');assert.doesNotMatch(JSON.stringify(failed),/private DB/);assert.equal(writes,1);
 let catalogReads=0;
 const schema=await readReleaseSchema({$queryRaw:async(strings:TemplateStringsArray)=>{
  const sql=strings.join('');catalogReads++;
  assert.match(sql,/c\.relname::text AS/,'catalog name type must be explicitly text for Neon/Prisma');
  if(sql.includes('pg_attribute'))assert.match(sql,/a\.attname::text AS/);
  if(sql.includes('pg_constraint'))assert.match(sql,/k\.conname::text AS/);
  return [];
 }} as any);
 assert.equal(catalogReads,3);assert.equal(schema.compatible,false);
 delete process.env.CUSTOMER_ROLLOUT_MANIFEST;
 console.log('PASS rollout admin: auth/origin, read-only status, exact stop-only scope, no sends');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
