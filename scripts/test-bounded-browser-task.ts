import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {boundedBrowserTask} from '../src/lib/local-workspace/bounded-browser-task';
import type {ApplyInput,PortalAdapter} from '../src/lib/portal-adapters/types';

async function main() {
 for (const scenario of ['normal','late-grant','after-submit','duplicate-hook','unproven-success']) {
  let data=0, submits=0, writes=0, active=1;
  const browser=await chromium.launch({headless:true});browser.on('disconnected',()=>active--);
  const launch=async()=>browser;
  const budgetMs=scenario==='late-grant'||scenario==='after-submit'?1500:10000;
  const run=boundedBrowserTask({enabled:true,owner:'owner',applicationId:'synthetic',budgetMs,launch});
  const input={applicationId:'synthetic',jobUrl:'https://bounded-fixture.invalid/application',
   beforeCandidateData:async()=>{data++;return true;},
   beforeSubmit:async()=>{submits++;if(scenario==='late-grant')await new Promise(r=>setTimeout(r,1800));return true;},
  } as ApplyInput;
  const adapter:PortalAdapter={id:'synthetic',label:'Synthetic contract',matches:u=>u===input.jobUrl,apply:async(page,i)=>{
   await page.goto(i.jobUrl);
   if(!await i.beforeCandidateData!())throw Error('data denied');
   await page.locator('input').fill('Synthetic contact');
   const grants=scenario==='duplicate-hook'?await Promise.all([i.beforeSubmit!(),i.beforeSubmit!()]):[await i.beforeSubmit!()];
   assert.equal(grants.filter(Boolean).length,1);
   if(scenario==='after-submit')await new Promise(r=>setTimeout(r,1800));
   await page.locator('input').fill('Synthetic reviewed');writes++;
   if(scenario==='unproven-success')return {ok:true,status:'submitted'};
   return {ok:false,status:'needs_user_input',error:'Synthetic review only',pendingQuestions:[]};
  }};
  await assert.rejects(run('other',adapter,input,'<input>'),/unavailable/);
  const result=await run('owner',adapter,input,'<input>');
  await assert.rejects(run('owner',adapter,input,'<input>'),/consumed/);
  if(scenario==='normal'||scenario==='duplicate-hook'){assert.equal(result.status,'needs_user_input');assert.equal(writes,1);}
  else {assert.equal(result.status,'submission_unconfirmed');assert.equal(writes,scenario==='unproven-success'?1:0);}
  await new Promise(r=>setTimeout(r,1900));
  assert.equal(data,1);assert.equal(submits,1);assert.equal(active,0);assert.equal(writes,scenario==='normal'||scenario==='duplicate-hook'||scenario==='unproven-success'?1:0);
  console.log('PASS bounded actual Chromium adapter contract',scenario,'one-use, owned, deadline closure; all non-fixture network blocked');
 }
}
void main();
