import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {PrismaClient} from '@prisma/client';
import {replaceCompletedSession} from '../src/lib/replace-application-session';
async function main(){
 const url=new URL(process.env.SESSION_TEST_DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/lavorai_session_replacement_test');process.env.DATABASE_URL=url.href;process.env.DIRECT_URL=url.href;
 const db=new PrismaClient();
 try{
 const existing=await db.$queryRawUnsafe<any[]>("SELECT count(*) FROM pg_tables WHERE schemaname='public'");assert.equal(Number(existing[0].count),0);
 execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'db','push','--skip-generate'],{env:process.env,stdio:'inherit'});
 const user=await db.user.create({data:{email:'synthetic-session@example.invalid'}});
 const old=await db.applicationSession.create({data:{userId:user.id,key:'cat::design',label:'Design',status:'completed',sentCount:5,targetCount:5,completedAt:new Date()}});
 const cutoff=new Date(Date.now()-60000);
 const job=await db.job.create({data:{source:'fixture',externalId:'session-job',title:'Synthetic',description:'Synthetic',url:'https://example.invalid/job'}});
 const pending=await db.application.create({data:{userId:user.id,jobId:job.id,sessionId:old.id,status:'awaiting_consent',portal:'fixture'}});
 const attempted=await db.application.create({data:{userId:user.id,jobId:job.id,sessionId:old.id,status:'awaiting_consent',portal:'fixture',submitStartedAt:new Date()}});
 const evidence=await db.application.create({data:{userId:user.id,jobId:job.id,sessionId:old.id,status:'awaiting_consent',portal:'fixture',canaryLog:'{"outboundRequest":true}'}});
 const historical=await db.application.create({data:{userId:user.id,jobId:job.id,sessionId:old.id,status:'awaiting_consent',portal:'fixture',createdAt:new Date(+cutoff-1000)}});
 assert.equal((await replaceCompletedSession(db,'foreign',old.id,cutoff)).ok,false);
 const result=await Promise.all([replaceCompletedSession(db,user.id,old.id,cutoff),replaceCompletedSession(db,user.id,old.id,cutoff)]);assert.ok(result.every(r=>r.ok));assert.equal(new Set(result.map(r=>r.ok&&r.sessionId)).size,1);assert.equal(result.reduce((n,r)=>n+(r.ok?r.moved:0),0),1);
 const fresh=await db.applicationSession.findUniqueOrThrow({where:{userId_key:{userId:user.id,key:'cat::design'}}});assert.notEqual(fresh.id,old.id);assert.equal(fresh.sentCount,0);assert.equal(fresh.targetCount,5);
 const saved=await db.applicationSession.findUniqueOrThrow({where:{id:old.id}});assert.equal(saved.sentCount,5);assert.equal(saved.targetCount,5);assert.ok(saved.key.startsWith('archived::'));
 const moved=await db.application.findUniqueOrThrow({where:{id:pending.id}});assert.equal(moved.sessionId,fresh.id);assert.equal(moved.status,'awaiting_consent');assert.equal(moved.consentGrantedAt,null);
 for(const id of [attempted.id,historical.id,evidence.id])assert.equal((await db.application.findUniqueOrThrow({where:{id}})).sessionId,old.id);
 assert.equal((await replaceCompletedSession(db,user.id,fresh.id,cutoff)).ok,false,'active round not reset');
 await db.applicationSession.update({where:{id:fresh.id},data:{status:'paused'}});assert.equal((await replaceCompletedSession(db,user.id,fresh.id,cutoff)).ok,false,'pause requires explicit resume not a new counter');
 console.log('PASS actual PostgreSQL owner-only replacement, concurrent idempotency, original category routing, old counters/history preserved, only untouched fresh pending rows moved, no consent/enqueue or uncertain replay');
 }finally{await db.$disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
