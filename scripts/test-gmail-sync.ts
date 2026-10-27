import assert from 'node:assert/strict';
import { gmailConnectionState, refreshFailure } from '../src/lib/gmail-sync-policy';
import { runGmailSync, type SyncAccount } from '../src/lib/gmail-sync-runner';
async function main() {
  let calls = 0, now = Date.now();
  const signins: SyncAccount[] = Array.from({length:264}, (_,i)=>({id:`a${i}`, userId:`u${i}`, scope:'openid email profile', access_token:'fake-expired', refresh_token:null, expires_at:1, user:{suspendedAt:null}}));
  const noop=async()=>{calls++;return {synced:0,skipped:0,complete:true};};
  const noMail=await runGmailSync(signins,new Map(),noop,()=>now);
  assert.equal(calls,0);assert.equal(noMail.signinOnly,264);assert.equal(noMail.status,'no_connected_mailboxes');assert.equal(noMail.ms,0);
  const eligible=signins.slice(0,12).map(a=>({...a,scope:'https://www.googleapis.com/auth/gmail.readonly',refresh_token:'synthetic-refresh'}));
  const expired={...eligible[0], id:'expired',refresh_token:null};
  assert.equal(gmailConnectionState(expired,now),'reconnect_required');
  assert.equal(refreshFailure(400,'invalid_grant'),'reconnect_required');
  assert.equal(refreshFailure(400,'invalid_client'),'server_configuration');
  assert.equal(refreshFailure(400,'unknown'),'temporary');
  assert.equal(refreshFailure(429,null),'temporary');
  const seen:string[]=[];
  const order=new Map(eligible.map((a,i)=>[a.id,100-i]));
  const partial=await runGmailSync([...signins,...eligible,expired],order,async(user,limit,deadline)=>{
    assert.equal(limit,50);assert.ok(deadline<=now+30_000);seen.push(user);now+=30_000;return {synced:1,skipped:0,complete:false,deferred:true};
  },()=>now);
  assert.equal(seen.length,8);assert.equal(seen[0],eligible[11].userId);assert.equal(partial.deferred,12);assert.equal(partial.reconnectRequired,1);
  console.log('PASS 264 sign-in accounts: zero provider calls/sleeps; scope classification, mixed eligibility, 240s deadline and oldest-attempt fairness.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
