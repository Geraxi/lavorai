import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const workflow=readFileSync('.github/workflows/cron-gmail-sync.yml','utf8');
const predicate=workflow.match(/jq -e '([^']+)'/)[1];
for(const [body,ok] of [[{ok:false,status:'degraded'},false],[{ok:true,status:'complete'},true],[{ok:true,status:'partial'},true],[{ok:true,status:'no_connected_mailboxes'},true],[{status:'complete'},false],[{ok:true,status:'unknown'},false]]){
 const r=spawnSync('jq',['-e',predicate],{input:JSON.stringify(body),encoding:'utf8'});assert.equal(r.status===0,ok);
}
assert.notEqual(spawnSync('jq',['-e',predicate],{input:'invalid JSON'}).status,0);
console.log('PASS actual workflow predicate: degraded/malformed/unknown fail; complete/partial/no connected mailboxes truthful.');
