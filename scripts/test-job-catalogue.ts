import assert from 'node:assert/strict';
import {catalogueJobVisible,catalogueWhere,PUBLICATION_FRESH_MS} from '../src/lib/job-catalogue-policy';
import {fetchRecruiteeJobs} from '../src/lib/scrapers/recruitee';
const now=new Date();
process.env.APPLICATION_PROVIDER_POLICY='recruitee_only';
process.env.APPLICATION_PROVIDER_NOT_BEFORE='2026-10-27T23:16:58.626Z';
const row={source:'recruitee',url:'https://owned.recruitee.com/o/developer',closedAt:null,applicationFormCapability:'standard',publicationVerifiedAt:now};
assert.equal(catalogueJobVisible(row,now),true);
for(const patch of [{url:'https://produzioneweb.recruitee.com/o/lavorai-test-ordinary-validation'},{applicationFormCapability:'questions'},{applicationFormCapability:'unsupported'},{applicationFormCapability:null},{source:'lever'},{closedAt:now},{publicationVerifiedAt:null},{publicationVerifiedAt:new Date(+now-PUBLICATION_FRESH_MS-1)},{publicationVerifiedAt:new Date(+now+1)},{url:'https://owned.recruitee.com.evil.test/o/developer'}])assert.equal(catalogueJobVisible({...row,...patch},now),false);
assert.equal(catalogueWhere(now).source,'recruitee');
const original=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({offers:[
{id:1,slug:'published',title:'Developer',location:'Italy',status:'published',open_questions:[{required:true,body:'Your answer'}]},
{id:2,slug:'closed',title:'Developer',location:'Italy',status:'closed'},
{id:3,slug:'unknown',title:'Developer',location:'Italy'},
{id:4,slug:'../unsafe',title:'Developer',location:'Italy',status:'published'}]}),{status:200})};
async function main(){try{
const jobs=await fetchRecruiteeJobs('owned');assert.equal(jobs.length,1);assert.equal(jobs[0].externalId,'1');assert.equal(jobs[0].publicationVerifiedAt,undefined,'board feed alone must not stamp application-form evidence');
assert.equal((await fetchRecruiteeJobs('evil.test@owned')).length,0);assert.equal(calls,1);
console.log('PASS catalogue: policy/closed/stale/unknown/origin fail closed; only explicit published ingestion, questions do not imply automatic eligibility; no real network');
}finally{globalThis.fetch=original}}
main().catch(e=>{console.error(e);process.exitCode=1});
