import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base='http://127.0.0.1:3077';
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 await page.goto(base+'/local-workspace');await page.getByRole('button',{name:'Start local session'}).click();await page.getByRole('button',{name:'Prepare fixture',exact:true}).waitFor();await page.getByRole('heading',{name:'Which work arrangement do you prefer?'}).waitFor();
 await page.getByRole('button',{name:'Take control',exact:true}).click();await page.getByRole('button',{name:'Scroll up',exact:true}).click();await page.waitForTimeout(300);await page.getByRole('button',{name:'Scroll up',exact:true}).click();await page.waitForTimeout(300);const img=page.locator('.lw-screen img');await img.waitFor();const box=await img.boundingBox();assert(box);
 const inputDone=()=>page.waitForResponse(r=>r.url().endsWith('/api/local-workspace')&&r.request().postDataJSON()?.action==='input');
 await Promise.all([inputDone(),img.click({position:{x:200*box.width/800,y:505*box.height/720}})]);
 await Promise.all([inputDone(),page.locator('.lw-screen').press('ArrowDown')]);
 await Promise.all([inputDone(),page.locator('.lw-screen').press('Enter')]);
 await page.waitForFunction(()=>document.querySelector('.lw-status')?.textContent==='prepared');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Browser',exact:true}).click();
 const mobile=await img.boundingBox();assert(mobile);await Promise.all([inputDone(),img.click({position:{x:200*mobile.width/800,y:265*mobile.height/720}})]);
 await page.getByLabel('Browser text input',{exact:true}).fill(' Mobile');await Promise.all([inputDone(),page.getByRole('button',{name:'Type in focused field',exact:true}).click()]);
 await page.screenshot({path:'/tmp/lavorai-local-workspace-input-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1100});
 await page.getByRole('button',{name:'Return control',exact:true}).click();
 await page.getByText('Review documents and answer provenance',{exact:true}).click();await page.getByRole('button',{name:'Restore reviewed saved facts and files',exact:true}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Submit local fixture')?.disabled);
 await page.screenshot({path:'/tmp/lavorai-local-workspace-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Submit local fixture',exact:true}).click();await page.getByText('Accepted by the local fixture',{exact:true}).waitFor();assert(await page.getByText(/HTTP 201 · 1 intercepted POST/).isVisible());
 const data=await page.evaluate(async()=>{const response=await fetch('/api/local-workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create'})});return {status:response.status,body:await response.json()};});assert.equal(data.status,409);
 const stranger=await browser.newContext();const resp=await stranger.request.get(base+'/api/local-workspace?id=unowned');assert.equal(resp.status(),404);const csrf=await stranger.request.post(base+'/api/local-workspace',{headers:{Origin:'https://outside.invalid'},data:{action:'create'}});assert.equal(csrf.status(),403);await stranger.close();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Browser',exact:true}).click();assert(await page.getByRole('region',{name:'Local browser'}).isVisible());await page.screenshot({path:'/tmp/lavorai-local-workspace-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Close session',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.lw-status')?.textContent==='closed');assert.deepEqual(errors,[]);console.log('PASS UI: complete local session, answer takeover/return, fixture receipt, mobile Browser tab, API owner/origin gates; no page errors.');
}finally{await browser.close();}
