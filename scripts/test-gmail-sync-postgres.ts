import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
async function main() {
  const url=new URL(process.env.GMAIL_TEST_DATABASE_URL ?? '');
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/lavorai_gmail_test');
  process.env.DATABASE_URL=url.href;process.env.DIRECT_URL=url.href;Object.assign(process.env,{NODE_ENV:'test',GOOGLE_CLIENT_ID:'fake-local',GOOGLE_CLIENT_SECRET:'fake-local-secret'});
  const {prisma:db}=await import('../src/lib/db');
  const count=await db.$queryRawUnsafe<Array<{count:bigint}>>("SELECT count(*) FROM pg_tables WHERE schemaname='public'");assert.equal(Number(count[0].count),0,'requires empty disposable database');
  execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'db','push','--skip-generate'],{stdio:'inherit',env:process.env});
  await db.$executeRawUnsafe('DROP TABLE "GmailSyncProgress"');
  for(const sql of readFileSync('prisma/migrations/20261027090000_gmail_sync_progress/migration.sql','utf8').split(';').filter(s=>s.trim()))await db.$executeRawUnsafe(sql);
  const {syncGmailMessages}=await import('../src/lib/gmail-client');
  const {claimGmailProgress,releaseGmailProgress,saveGmailProgress}=await import('../src/lib/gmail-sync-progress');
  await db.user.create({data:{id:'gmail-owner',email:'gmail-owner@example.test'}});
  await db.account.create({data:{id:'google-fixture',userId:'gmail-owner',type:'oauth',provider:'google',providerAccountId:'fake-google',scope:'https://www.googleapis.com/auth/gmail.readonly',access_token:'fake-token',expires_at:Math.floor(Date.now()/1000)+3600}});
  await assert.rejects(()=>db.$executeRawUnsafe(`INSERT INTO "GmailSyncProgress" ("accountId", "leaseToken") VALUES ('google-fixture', 'bad')`));
  const claims=await Promise.all(Array.from({length:8},()=>claimGmailProgress('google-fixture')));
  assert.equal(claims.filter(Boolean).length,1);const claim=claims.find(Boolean)!;
  await releaseGmailProgress(claim,null);await assert.rejects(()=>saveGmailProgress(claim),/lease_lost/);
  let mode='pages', requests=0, refreshes=0, listed=0, failMessage=false;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    requests++;const u=new URL(String(input));
    if(u.hostname==='oauth2.googleapis.com') {
      assert.equal(init?.method,'POST');refreshes++;
      if(mode==='refresh400')return Response.json({error:'invalid_grant',error_description:'DO_NOT_LOG_FAKE_SECRET'},{status:400});
      return Response.json({access_token:'fresh-fake-token',expires_in:3600});
    }
    assert.equal(u.hostname,'gmail.googleapis.com');assert.ok(!init?.method||init.method==='GET','no sends allowed');assert.ok(init?.signal,'all requests bounded');
    if(u.pathname.endsWith('/messages')) {
      listed++;assert.equal(u.searchParams.get('labelIds'),'INBOX');assert.match(u.searchParams.get('q')??'',/before:\d+/);
      if(mode==='empty') return Response.json({messages:[]});
      if(mode==='cursor400'&&u.searchParams.has('pageToken'))return Response.json({error:'invalid cursor'},{status:400});
      const page=Number(u.searchParams.get('pageToken')??0);
      return Response.json({messages:Array.from({length:page===2?6:25},(_,i)=>({id:`msg-${page*25+i}`,threadId:'thread'})),nextPageToken:page<2?String(page+1):undefined});
    }
    const id=u.pathname.split('/').at(-1)!;
    if(failMessage){failMessage=false;throw new Error('provider unavailable DO_NOT_LOG_FAKE_SECRET');}
    return Response.json({id,threadId:'thread',payload:{headers:[{name:'From',value:'careers@example.test'},{name:'Subject',value:'Application received'},{name:'Date',value:'Tue, 27 Oct 2026 00:00:00 GMT'}],mimeType:'text/plain',body:{data:Buffer.from('We received your application.').toString('base64url')}}});
  };
  const capturedLogs: string[]=[];
  const originalError=console.error, originalWarn=console.warn;
  console.error=(...args)=>capturedLogs.push(args.join(' '));console.warn=(...args)=>capturedLogs.push(args.join(' '));
  try {
    const parallel = await Promise.all(Array.from({length:6},()=>syncGmailMessages('gmail-owner',1)));
    assert.equal(parallel.reduce((sum,r)=>sum+r.synced,0),1);assert.equal(parallel.filter(r=>r.deferred).length,6);
    let r=parallel.find(r=>r.synced===1)!;assert.equal(r.complete,false);
    let rows=await db.$queryRawUnsafe<any[]>('SELECT * FROM "GmailSyncProgress"');assert.equal(rows[0].messageIds.length,24);assert.equal(rows[0].completedBefore,null);
    // Simulate crash after source commit but before checkpoint advancement.
    await db.$executeRawUnsafe(`UPDATE "GmailSyncProgress" SET "messageIds"=ARRAY['msg-0'] || "messageIds"`);
    failMessage=true;r=await syncGmailMessages('gmail-owner',50);assert.equal(r.error,'temporary');assert.equal(await db.gmailMessage.count(),1);
    await db.$executeRawUnsafe('UPDATE "GmailSyncProgress" SET "nextAttemptAt"=NOW()');
    r=await syncGmailMessages('gmail-owner',100);assert.equal(r.complete,true);assert.equal(await db.gmailMessage.count(),56);assert.equal(listed,3,'resume saved IDs rather than relist page');
    r=await syncGmailMessages('gmail-owner',100);assert.equal(r.complete,true);assert.equal(await db.gmailMessage.count(),56,'replay must not duplicate');
    assert.equal(await db.application.count(),0,'mail imports never create applications');
    // Interrupted lease after source commit: replay source IDs remains idempotent.
    const before=requests;r=await syncGmailMessages('gmail-owner',50,Date.now()-1);assert.equal(r.deferred,true);assert.equal(requests,before);
    await db.$executeRawUnsafe(`UPDATE "GmailSyncProgress" SET "scanBefore"=1234567890, "pageToken"='bad', "messageIds"=ARRAY[]::text[], "nextAttemptAt"=NOW()`);
    mode='cursor400';r=await syncGmailMessages('gmail-owner');assert.equal(r.error,'cursor_invalid');rows=await db.$queryRawUnsafe<any[]>('SELECT * FROM "GmailSyncProgress"');assert.equal(rows[0].pageToken,null);assert.equal(Number(rows[0].scanBefore),1234567890);
    await db.$executeRawUnsafe('UPDATE "GmailSyncProgress" SET "nextAttemptAt"=NOW()');
    await db.account.update({where:{id:'google-fixture'},data:{access_token:null,refresh_token:'fake-refresh',expires_at:0}});
    mode='refresh400';r=await syncGmailMessages('gmail-owner');assert.equal(r.error,'reconnect_required');assert.equal(refreshes,1);
    const beforeBackoff=requests;r=await syncGmailMessages('gmail-owner');assert.equal(r.deferred,true);assert.equal(r.error,'reconnect_required');assert.equal(requests,beforeBackoff);
    await db.$executeRawUnsafe('UPDATE "GmailSyncProgress" SET "nextAttemptAt"=NOW()');
    mode='empty';r=await syncGmailMessages('gmail-owner');assert.equal(r.complete,true);assert.equal(refreshes,2);assert.equal((await db.account.findUnique({where:{id:'google-fixture'}}))?.access_token,'fresh-fake-token');
    assert.ok(!capturedLogs.join(' ').includes('DO_NOT_LOG_FAKE_SECRET'));
    assert.ok(!capturedLogs.join(' ').includes('fake-token'));
    console.log('PASS actual PostgreSQL migration/CHECK, eight concurrent leases, stale fencing, multi-page resume, replay dedup, failure checkpoint, expired cursor restart, deadline, refresh-only token/400/backoff, zero sends.');
  } finally {console.error=originalError;console.warn=originalWarn;globalThis.fetch=originalFetch;await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
