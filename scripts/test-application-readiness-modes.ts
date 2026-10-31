import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as prerequisite from '../src/lib/application-prerequisites';
import * as billing from '../src/lib/billing';
let mode='auto',patch:any={},waiting=0;
const account={privacyConsentAt:new Date(),emailVerified:new Date(),onboardedAt:new Date(),seniority:'mid',englishLevel:'B2',noticePeriod:'now',cvProfile:{id:'synthetic'},tier:'pro',subscriptionStatus:'active',currentPeriodEnd:new Date(Date.now()+86400000)};
const deps:any={'@/lib/application-pause':{applicationsPaused:()=>false},'@/lib/application-rollout':{applicationRolloutConfig:()=>({enabled:true}),automaticApplicationsBlocked:()=>false},'./application-prerequisites':prerequisite,'./billing':billing,'@/lib/db':{prisma:{
 user:{findUnique:async()=>({...account,...patch})},userPreferences:{findUnique:async()=>({autoApplyMode:mode,rolesJson:'["Engineer"]',locationsJson:'["Italy"]'})},cVDocument:{count:async()=>1},application:{count:async({where}:any)=>where.status==='awaiting_consent'?waiting:0}
}}};
const module={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/auto-apply-readiness.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((id:string)=>{assert.ok(id in deps,id);return deps[id]},module,module.exports);
async function main(){
const read=()=>module.exports.getAutoApplyReadiness('synthetic',3);
assert.match((await read()).title,/Profilo pronto/);
for(const field of ['privacyConsentAt','emailVerified','cvProfile','seniority','englishLevel','noticePeriod','onboardedAt']){patch={[field]:null};const r=await read();assert.equal(r.tone,'action');assert.doesNotMatch(r.title,/pronto|attiva|al lavoro/);}
patch={subscriptionStatus:'paused'};assert.equal((await read()).tone,'paused');patch={};
mode='hybrid';assert.match((await read()).detail,/Non vengono inviate automaticamente/);waiting=1;assert.match((await read()).title,/consenso/);waiting=0;
mode='manual';assert.match((await read()).title,/Scegli/);assert.doesNotMatch((await read()).title,/Auto-apply|ricerca attiva/);
mode='off';assert.equal((await read()).tone,'paused');
console.log('PASS actual readiness: consent/verification/profile/professional fields and paused entitlement; auto vs hybrid approval vs manual vs off, no mutations');
}
main().catch(e=>{console.error(e);process.exitCode=1});
