import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import {parseProfile,supportedUrl,fillContacts} from '../extensions/candidate-autofill/core.js';
const manifest=JSON.parse(fs.readFileSync('extensions/candidate-autofill/manifest.json'));
assert.deepEqual(manifest.permissions,['activeTab','scripting']);assert.equal(manifest.host_permissions,undefined);assert.equal(manifest.content_scripts,undefined);
const profile=parseProfile(JSON.stringify({version:1,purpose:'lavorai-contact-autofill',name:'Synthetic Candidate',email:'synthetic@example.invalid',phone:'+390000000',secret:'discard'}));assert.equal(profile.secret,undefined);
assert.throws(()=>parseProfile('{}'));assert.throws(()=>parseProfile('a'.repeat(8193)));
const url='https://produzioneweb.recruitee.com/o/lavorai-test-autofill/c/new';
assert(supportedUrl(url));for(const bad of ['https://evil.test/o/lavorai-test-a/c/new',url+'?redirect=evil','https://produzioneweb.recruitee.com.evil.test/o/lavorai-test-a/c/new','https://other.recruitee.com/o/job/c/new'])assert(!supportedUrl(bad));
const browser=await chromium.launch({headless:true,...(process.env.AUTOFILL_TEST_CHROME==='1'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage();let external=0,posts=0;
 const html=`<form><input name="candidate[name]"><input name="candidate[email]" type="email"><input name="candidate[phone]" type="tel"><input name="screening" value=""><input type="checkbox" name="consent"><input type="file" name="candidate[cv]"><button>Submit</button></form><script>window.submits=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submits++}</script>`;
 await page.route('**/*',route=>{if(route.request().method()==='POST')posts++;if(route.request().url()===url)return route.fulfill({contentType:'text/html',body:html});external++;return route.abort();});
 await page.goto(url);
 const call=perform=>page.evaluate(({fn,profile,url,perform})=>new Function(`return (${fn})`)()(profile,url,perform),{fn:fillContacts.toString(),profile,url,perform});
 assert.equal((await call(false)).ready,true);assert.equal(await page.inputValue('[name="candidate[name]"]'),'');
 assert.deepEqual((await call(true)).filled,['name','email','phone']);assert.equal(await page.inputValue('[name="candidate[email]"]'),profile.email);assert.equal(await page.isChecked('[name=consent]'),false);assert.equal(await page.inputValue('[name=screening]'),'');assert.equal(await page.inputValue('[type=file]'),'');assert.equal(await page.evaluate(()=>window.submits),0);
 await page.fill('[name="candidate[name]"]','Existing person');assert.match((await call(true)).error,/Existing/);
 await page.fill('[name="candidate[name]"]','');await page.evaluate(()=>{const e=document.createElement('input');e.name='candidate[email]';document.body.append(e)});assert.match((await call(false)).error,/ambiguous/);
 await page.goto(url);await page.evaluate(()=>document.querySelector('input').style.display='none');assert.match((await call(true)).error,/hidden/);
 await page.goto(url);await page.evaluate(()=>{const e=document.createElement('div');e.className='g-recaptcha';document.body.append(e)});assert.match((await call(true)).error,/CAPTCHA/);
 assert.equal(posts,0);assert.equal(external,0);
 console.log('PASS: synthetic browser autofill, preview/no-write, exact-origin, ambiguity, existing values, hidden fields, CAPTCHA refusal; consent/CV/questions untouched; zero POSTs/external requests.');
}finally{await browser.close()}
