import assert from 'node:assert/strict';
import {WorkspaceEngine} from '../src/lib/local-workspace/engine';
async function main(){
const engine=new WorkspaceEngine();
try{
 await assert.rejects(engine.create('engine-check','obscura'),/unavailable/);
 const simultaneous=await Promise.allSettled([engine.create('alice'),engine.create('alice')]);assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);let a=(simultaneous.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof engine.create>>>).value;
 await assert.rejects(engine.snapshot(a.id,'bob'),/unavailable/);
 a=await engine.act(a.id,'alice',a.revision,'prepare');assert.equal(a.status,'needs_answer');
 a=await engine.act(a.id,'alice',a.revision,'answer','Remote');assert.equal(a.controller,'agent');
 a=await engine.act(a.id,'alice',a.revision,'pause');await assert.rejects(engine.act(a.id,'alice',a.revision,'prepare'));a=await engine.snapshot(a.id,'alice');
 a=await engine.act(a.id,'alice',a.revision,'take');const revision=a.revision;
 const race=await Promise.allSettled([engine.act(a.id,'alice',revision,'answer','Remote'),engine.act(a.id,'alice',revision,'return')]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 a=await engine.snapshot(a.id,'alice');assert.equal(a.controller,'human');a=await engine.act(a.id,'alice',a.revision,'return');
 const sends=await Promise.allSettled([engine.act(a.id,'alice',a.revision,'submit'),engine.act(a.id,'alice',a.revision,'submit')]);assert.equal(sends.filter(r=>r.status==='fulfilled').length,1);a=await engine.snapshot(a.id,'alice');assert.equal(a.posts,1);assert.equal(a.status,'accepted');assert(a.receipt);await assert.rejects(engine.act(a.id,'alice',a.revision,'submit'),/terminal/);
 let b=await engine.create('bob');assert.equal(b.posts,0);assert.equal(b.answer,'');b=await engine.act(b.id,'bob',b.revision,'prepare');b=await engine.act(b.id,'bob',b.revision,'take');b=await engine.act(b.id,'bob',b.revision,'answer','Hybrid');b=await engine.act(b.id,'bob',b.revision,'return');b=await engine.act(b.id,'bob',b.revision,'uncertain');assert.equal(b.status,'unknown');await assert.rejects(engine.act(b.id,'bob',b.revision,'submit'),/terminal/);assert.equal(b.posts,0);
 const short=new WorkspaceEngine(50);try{const c=await short.create('expiry');await new Promise(r=>setTimeout(r,100));const expired=await short.snapshot(c.id,'expiry');assert.equal(expired.status,'expired');await assert.rejects(short.act(c.id,'expiry',expired.revision,'prepare'),/terminal/);}finally{await short.destroy();}
 console.log('PASS real Chromium/local fixtures: exclusive ownership, cross-owner isolation, duplicate create, controller race, expiry, one POST/receipt, uncertainty no retry.');
}finally{await engine.destroy();}

}
main().catch(e=>{console.error(e);process.exitCode=1});
