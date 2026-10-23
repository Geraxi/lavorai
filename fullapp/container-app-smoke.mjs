import assert from 'node:assert/strict';
import { chromium } from 'playwright';
assert.equal(process.version,'v24.22.1');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage(); await page.setContent('<title>Offline smoke</title>'); assert.equal(await page.title(),'Offline smoke'); await browser.close();
process.env.VERCEL='1';
const {launchBrowser}=await import('../src/lib/browser.ts');
const actual=await launchBrowser(); const actualPage=await actual.newPage(); await actualPage.setContent('<title>App launcher</title>'); assert.equal(await actualPage.title(),'App launcher'); await actual.close();
const base=`http://127.0.0.1:${process.env.PORT || '8080'}`;
for (let n=0;n<30;n++){try {await fetch(base+'/api/health/application-pause');break;}catch{await new Promise(r=>setTimeout(r,1000));}}
for(const path of ['/dashboard','/admin/users']){const r=await fetch(base+path,{redirect:'manual'});assert.equal(r.status,307,path);assert.match(r.headers.get('location'),/login/);}
for(const path of ['/api/cron/nudges','/api/cron/sync-jobs','/api/cron/editorial','/api/cron/mailbox-delivery']){const r=await fetch(base+path);assert.equal(r.status,401,path);}
console.log(JSON.stringify({node:process.version,chromium:'offline passed',auth:'unauthenticated redirects passed',cron:'all four denied without credentials'}));
