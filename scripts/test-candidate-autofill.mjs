import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import {parseProfile,supportedUrl,fillContacts} from '../extensions/candidate-autofill/core.js';
const manifest=JSON.parse(fs.readFileSync('extensions/candidate-autofill/manifest.json'));
assert.deepEqual(manifest.permissions,['activeTab','scripting']);assert.equal(manifest.host_permissions,undefined);assert.equal(manifest.content_scripts,undefined);
const profile=parseProfile(JSON.stringify({version:1,purpose:'lavorai-contact-autofill',name:'Synthetic Candidate',email:'synthetic@example.invalid',phone:'+390000000',secret:'discard'}));assert.equal(profile.secret,undefined);
assert.throws(()=>parseProfile('{}'));assert.throws(()=>parseProfile('a'.repeat(262145)));
const url='https://produzioneweb.recruitee.com/o/lavorai-test-autofill/c/new';
assert(supportedUrl('https://optics11.recruitee.com/o/senior-customer-experience-designer/c/new'));assert(!supportedUrl('https://optics11.recruitee.com/o/another-job/c/new'));assert(supportedUrl(url));for(const bad of ['https://evil.test/o/lavorai-test-a/c/new',url+'?redirect=evil','https://produzioneweb.recruitee.com.evil.test/o/lavorai-test-a/c/new','https://other.recruitee.com/o/job/c/new'])assert(!supportedUrl(bad));
const browser=await chromium.launch({headless:true,...(process.env.AUTOFILL_TEST_CHROME==='1'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage();let external=0,posts=0;
 const html=`<form id="offer-application-form"><input name="candidate.name"><input name="candidate.email" type="email"><input name="candidate.phone" type="tel"><input name="screening" value=""><input type="checkbox" name="consent"><input type="file" name="candidate.cv"><button>Submit</button></form><script>window.submits=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submits++}</script>`;
 await page.route('**/*',route=>{if(route.request().method()==='POST')posts++;if(route.request().url()===url)return route.fulfill({contentType:'text/html',body:html});external++;return route.abort();});
 await page.goto(url);
 const call=perform=>page.evaluate(({fn,profile,url,perform})=>new Function(`return (${fn})`)()(profile,url,perform),{fn:fillContacts.toString(),profile,url,perform});
 assert.equal((await call(false)).ready,true);assert.equal(await page.inputValue('[name="candidate.name"]'),'');
 assert.deepEqual((await call(true)).filled,['name','email','phone']);assert.equal(await page.inputValue('[name="candidate.email"]'),profile.email);assert.equal(await page.isChecked('[name=consent]'),false);assert.equal(await page.inputValue('[name=screening]'),'');assert.equal(await page.inputValue('[type=file]'),'');assert.equal(await page.evaluate(()=>window.submits),0);
 await page.fill('[name="candidate.name"]','Existing person');assert.match((await call(true)).error,/Existing/);
 await page.fill('[name="candidate.name"]','');await page.evaluate(()=>{const e=document.createElement('input');e.name='candidate.email';document.body.append(e)});assert.match((await call(false)).error,/ambiguous/);
 await page.goto(url);await page.evaluate(()=>document.querySelector('input').style.display='none');assert.match((await call(true)).error,/hidden/);
 await page.goto(url);await page.evaluate(()=>{const e=document.createElement('div');e.className='g-recaptcha';document.body.append(e)});assert.match((await call(true)).error,/CAPTCHA/);
 await page.goto(url);await page.locator('[name="candidate.phone"]').evaluate(e=>e.placeholder='+31');assert.equal((await call(false)).ready,true);
 await page.fill('[name="candidate.phone"]','+31');assert.match((await call(true)).error,/country-code prefix/);assert.equal(await page.inputValue('[name="candidate.name"]'),'');assert.equal(await page.inputValue('[name="candidate.phone"]'),'+31');
 await page.fill('[name="candidate.phone"]','+31612345678');assert.match((await call(true)).error,/Existing phone/);assert.equal(await page.inputValue('[name="candidate.phone"]'),'+31612345678');
 await page.fill('[name="candidate.phone"]','');assert.equal((await call(false)).ready,true);assert.deepEqual((await call(true)).filled,['name','email','phone']);
 await page.goto(url);
 // Exact observed integration, synthetic attributes only. No cross-origin load.
 await page.evaluate(()=>{const p=document.createElement('div');p.id='input-captchaToken-fixture';const e=document.createElement('iframe');e.title='Widget containing checkbox for hCaptcha security challenge';e.style.visibility='hidden';p.append(e);document.querySelector('form').append(p);Object.defineProperty(e,'src',{value:'https://captcha-assets.recruiteecdn.com/captcha/v1/fixture/static/hcaptcha-enclave.html#synthetic-opaque-state',configurable:true});e.setAttribute('src-marker','captcha');});
 // Include the iframe in the detector selector without navigating its document.
 await page.evaluate(()=>{const e=document.querySelector('iframe');e.setAttribute('src','about:blank#captcha');});
 assert.equal((await call(false)).ready,true);
 const captchaBefore=await page.locator('iframe').evaluate(e=>e.outerHTML);
 assert.deepEqual((await call(true)).filled,['name','email','phone']);
 assert.equal(await page.locator('iframe').evaluate(e=>e.outerHTML),captchaBefore);
 assert.equal(await page.locator('iframe').evaluate(e=>getComputedStyle(e).visibility),'hidden');assert.equal(await page.evaluate(()=>window.submits),0);
 await page.fill('[name="candidate.name"]','');await page.fill('[name="candidate.email"]','');await page.fill('[name="candidate.phone"]','');
 await page.locator('iframe').evaluate(e=>e.style.visibility='visible');assert.match((await call(true)).error,/CAPTCHA/);assert.equal(await page.inputValue('[name="candidate.name"]'),'');assert.equal(await page.inputValue('[name="candidate.email"]'),'');assert.equal(await page.inputValue('[name="candidate.phone"]'),'');
 await page.locator('iframe').evaluate(e=>{e.style.visibility='hidden';e.title='Unknown challenge';});assert.match((await call(false)).error,/CAPTCHA/);
 // Only one exact parsed provider frame is tolerated; never substring trust.
 for (const bad of ['https://captcha-assets.recruiteecdn.com.evil.invalid/captcha/v1/fixture/static/hcaptcha-enclave.html','https://evil.invalid/captcha/v1/fixture/static/hcaptcha-enclave.html','https://captcha-assets.recruiteecdn.com/captcha/v1/fixture/static/other.html','https://captcha-assets.recruiteecdn.com/captcha/v1/fixture/static/hcaptcha-enclave.html?redirect=elsewhere'].flatMap(u=>[u,u+'#synthetic-opaque-state'])) {
  await page.locator('iframe').evaluate((e,src)=>{e.title='Widget containing checkbox for hCaptcha security challenge';Object.defineProperty(e,'src',{value:src,configurable:true});},bad);
  assert.match((await call(false)).error,/CAPTCHA/);
 }
 await page.locator('iframe').evaluate(e=>{Object.defineProperty(e,'src',{value:'https://captcha-assets.recruiteecdn.com/captcha/v1/fixture/static/hcaptcha-enclave.html#synthetic-opaque-state',configurable:true});e.style.visibility='inherit';e.parentElement.style.visibility='hidden';});
 assert.equal((await call(false)).ready,true);
 await page.locator('iframe').evaluate(e=>e.style.visibility='visible');assert.match((await call(true)).error,/CAPTCHA/);
 await page.locator('iframe').evaluate(e=>{e.style.visibility='hidden';const extra=document.createElement('div');extra.className='h-captcha';extra.style.display='none';document.body.append(extra);});assert.match((await call(true)).error,/CAPTCHA/);
 assert.equal(posts,0);assert.equal(external,0);
 console.log('PASS: synthetic browser autofill, preview/no-write, exact-origin, ambiguity, existing values, hidden fields, CAPTCHA refusal; consent/CV/questions untouched; zero POSTs/external requests.');
}finally{await browser.close()}
