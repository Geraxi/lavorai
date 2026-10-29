import assert from 'node:assert/strict';
import {boundedObservation} from '../tools/stagehand-observer/adapter';
let expired=false;
async function main(){await assert.rejects(boundedObservation(new Promise(()=>{}),()=>{expired=true;},20),/deadline/);assert.equal(expired,true);assert.equal(await boundedObservation(Promise.resolve('ready'),()=>{throw Error('unexpected expiry');},20),'ready');console.log('PASS stalled SDK deadline and completed-operation cleanup (controlled promise, not model inference)');}
void main();
