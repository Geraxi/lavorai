import assert from "node:assert/strict";
import { WorkerDrain } from "../src/lib/worker-drain";
import { sendersPaused } from "../src/lib/sender-hold";
import { applicationsPaused } from "../src/lib/application-pause";
import { Resend } from "../src/lib/resend";
import { gmailClient, graphClient } from "../src/lib/mailbox/providers";
async function main() {
const old = process.env.SENDERS_PAUSED;
try {
 for (const value of ["true", "1", "unexpected"]) { process.env.SENDERS_PAUSED=value; assert.equal(sendersPaused(),true); assert.equal(applicationsPaused(),true); }
 process.env.SENDERS_PAUSED="true";
 let calls=0;
 const fakeFetch = async () => { calls++; throw new Error("must not reach provider"); };
 for (const client of [gmailClient("fake",fakeFetch),graphClient("fake",fakeFetch)]) await assert.rejects(client.send({} as never),/senders_paused/);
 await assert.rejects(new Resend("re_fake_local_only").emails.send({from:"a@example.invalid",to:"b@example.invalid",subject:"test",text:"local"}),/senders_paused/);
 assert.equal(calls,0);
 const drain=new WorkerDrain(); let release!:()=>void;
 const pending=drain.run(()=>new Promise<void>(resolve=>{release=resolve;}));
 await Promise.resolve(); let closed=false;
 const close=drain.close().then(()=>{closed=true;});
 await assert.rejects(drain.run(async()=>{calls++;}),/worker_draining/);
 assert.equal(closed,false);
 // A claim obtained by an already tracked poll must still complete during drain.
 let admitted=false; await drain.run(async()=>{admitted=true;},true); assert.equal(admitted,true);
 release(); await pending; await close; assert.equal(closed,true); assert.equal(drain.pending,0);
 const failed=new WorkerDrain(); await assert.rejects(failed.run(async()=>{throw new Error("simulated");}),/simulated/); await failed.close();
 console.log("PASS cutover: no provider requests, admission stopped, in-flight work drained");
} finally { if(old===undefined) delete process.env.SENDERS_PAUSED; else process.env.SENDERS_PAUSED=old; }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
