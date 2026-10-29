import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {LocalProviderCoordinator} from '../src/lib/local-workspace/provider-coordinator';
import {fixtureOrigin,providerFixture,type FixtureProvider} from '../src/lib/local-workspace/provider-fixtures';
async function main(){
 const browser=await chromium.launch({headless:true});
 try{for(const provider of ['lever','greenhouse','ashby'] as FixtureProvider[])for(const outcome of ['accepted','unknown']){
  const context=await browser.newContext({serviceWorkers:'block'});let posts=0,external=0;
  await context.route('**/*',r=>{if(r.request().url()===fixtureOrigin+'/'+provider&&r.request().method()==='GET')return r.fulfill({body:providerFixture(provider),contentType:'text/html'});if(r.request().url()===fixtureOrigin+'/candidate'&&r.request().method()==='POST'){posts++;return outcome==='unknown'?r.abort():r.fulfill({status:201,body:'{}'});}external++;return r.abort();});
  const page=await context.newPage();await page.goto(fixtureOrigin+'/'+provider);
  assert.throws(()=>new LocalProviderCoordinator(page,provider,'owner'),/disabled/);
  const previous=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:'production'});
  assert.throws(()=>new LocalProviderCoordinator(page,provider,'owner',true),/disabled/);
  if(previous===undefined)delete process.env.NODE_ENV;else Object.assign(process.env,{NODE_ENV:previous});
  const expired=new LocalProviderCoordinator(page,provider,'owner',true,-1);await assert.rejects(expired.act('owner',0,'prepare'),/terminal/);
  const c=new LocalProviderCoordinator(page,provider,'owner',true);
  await assert.rejects(c.act('other',0,'prepare'),/unavailable/);
  let s=await c.act('owner',0,'prepare');await assert.rejects(c.act('owner',0,'prepare'),/Control changed/);
  await assert.rejects(c.act('owner',s.revision,'submit'),/Explicit answers/);s=c.snapshot('owner');
  s=await c.act('owner',s.revision,'answer',{eligibility:'yes',sponsorship:'no',narrative:'SYNTHETIC approved: Fixture work only.'});
  s=await c.act('owner',s.revision,'letter');
  const results=await Promise.allSettled([c.act('owner',s.revision,'submit'),c.act('owner',s.revision,'submit')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(c.snapshot('owner').status,outcome);assert.equal(posts,1);assert.equal(external,0);
  await assert.rejects(c.act('owner',c.snapshot('owner').revision,'submit'),/terminal/);
  await context.close();console.log('PASS coordinator',provider,outcome,'ownership/revision/expiry/one POST');
 }}finally{await browser.close();}
}
void main();
