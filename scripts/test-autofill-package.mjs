import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {chromium} from 'playwright';
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
try {
 const page=await context.newPage();
 const cdp=await context.browser().newBrowserCDPSession();
 const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve('extensions/candidate-autofill')});
 const url=process.env.AUTOFILL_FIXTURE_OPTICS==='1'?'https://optics11.recruitee.com/o/senior-customer-experience-designer/c/new':'https://produzioneweb.recruitee.com/o/lavorai-test-package/c/new';
 const frameUrl='https://captcha-assets.recruiteecdn.com/captcha/v1/fixture/static/hcaptcha-enclave.html';
 let posts=0,unexpected=0;
 await context.route(/^https?:\/\//,route=>{const r=route.request();if(r.method()==='POST')posts++;if(r.url()===frameUrl)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic inert frame</title>'});if(r.url()===url)return route.fulfill({contentType:'text/html',body:'<form id="offer-application-form"><input name="candidate.name"><input type="email" name="candidate.email"><input type="tel" name="candidate.phone"><textarea name="screening"></textarea><input type="checkbox" name="consent"><input type="file" name="candidate.cv"><button>Submit</button><div id="input-captchaToken-fixture"><iframe title="Widget containing checkbox for hCaptcha security challenge" style="visibility:hidden;position:fixed;width:842px;height:717px" src="https://captcha-assets.recruiteecdn.com/captcha/v1/fixture/static/hcaptcha-enclave.html#synthetic-opaque-state"></iframe></div><input type="hidden" name="captchaToken" value="synthetic-unchanged"></form>'});unexpected++;return route.abort();});
 await page.goto(url);await page.bringToFront();
 const {targetInfos}=await cdp.send('Target.getTargets',{filter:[{type:'tab',exclude:false}]});
 const targetInfo=targetInfos.find(t=>t.url===url);if(!targetInfo)throw Error(JSON.stringify(targetInfos));
 await cdp.send('Extensions.triggerAction',{id,targetId:targetInfo.targetId});
 let popupTarget;for(let i=0;i<100&&!popupTarget;i++){const targets=await cdp.send('Target.getTargets');popupTarget=targets.targetInfos.find(t=>t.url===`chrome-extension://${id}/popup.html`);if(!popupTarget)await new Promise(r=>setTimeout(r,50));}
 assert(popupTarget,'Packaged popup opened via actual extension action');
 // Playwright does not expose toolbar popups as Page objects. Use public CDP
 // target sessions to operate that actual popup, without mocking chrome APIs.
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:popupTarget.targetId,flatten:false});
 let seq=0;const pending=new Map();
 cdp.on('Target.receivedMessageFromTarget',event=>{if(event.sessionId!==sessionId)return;const m=JSON.parse(event.message);const item=pending.get(m.id);if(item){pending.delete(m.id);m.error?item.reject(Error(m.error.message)):item.resolve(m.result);}});
 async function send(method,params={}){const n=++seq;const result=new Promise((resolve,reject)=>pending.set(n,{resolve,reject}));await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:n,method,params})});return result;}
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
 async function click(selector){const rect=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect});}
 async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Popup timeout: '+await evaluate('document.querySelector("#status").textContent'));}
 async function upload(data){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lavorai-autofill-fixture-'));try{const file=path.join(dir,'profile.json');await fs.writeFile(file,JSON.stringify(data));const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#profile'});await send('DOM.setFileInputFiles',{nodeId,files:[file]});await until('document.querySelector("#preview").textContent.includes('+JSON.stringify(data.name)+')');}finally{await fs.rm(dir,{recursive:true});}}
 const data={version:2,purpose:'lavorai-contact-autofill',name:'Synthetic Alice',email:'alice@example.invalid',phone:'000',cvFilename:'synthetic-alice.pdf',experiences:[{role:'Designer',company:'Synthetic Co',location:'Rome',startDate:'2020-01',endDate:'2022-01',description:'Synthetic history only',bullets:[]}]};
 await until('typeof document.querySelector("#profile")?.onchange === "function"');
 await upload(data);
 await click('#consent');await click('#inspect');
 await until('!document.querySelector("#fill").disabled');
 assert.equal(await page.inputValue('[name="candidate.name"]'),'');
 assert((await evaluate('document.querySelector("#history").value')).includes('Synthetic Co'));
 await click('#fill');await click('#fill');
 await until('document.querySelector("#status").textContent.includes("Contact fields filled")');
 assert.equal(await page.inputValue('[name="candidate.email"]'),'alice@example.invalid');
 assert.equal(await page.isChecked('[name=consent]'),false);assert.equal(await page.inputValue('[name=screening]'),'');assert.equal(await page.inputValue('[type=file]'),'');
 assert.equal(await evaluate('document.querySelector("#history").value'),'');assert.equal(await evaluate('document.querySelector("#fill").disabled'),true);
 const bob={...data,name:'Synthetic Bob',email:'bob@example.invalid',experiences:[],cvFilename:'bob.pdf'};
 await upload(bob);assert(!(await evaluate('document.body.textContent')).includes('alice@example.invalid'));assert.equal(await evaluate('document.querySelector("#history").value'),'');
 await click('#consent');await click('#inspect');await until('document.querySelector("#status").textContent.includes("Existing values differ")');
 assert.equal(await page.inputValue('[name="candidate.email"]'),'alice@example.invalid');
 await click('#clear');assert.equal(await evaluate('document.querySelector("#preview").textContent'),'No data loaded.');
 await page.locator('[type=file]').setInputFiles({name:'synthetic-alice.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-synthetic')});
 assert.equal(await page.locator('[type=file]').evaluate(e=>e.files[0].name),'synthetic-alice.pdf');
 assert.equal(await page.locator('iframe').getAttribute('src'),frameUrl+'#synthetic-opaque-state');assert.equal(await page.locator('[name=captchaToken]').inputValue(),'synthetic-unchanged');
 assert.equal(posts,0);assert.equal(unexpected,0);
 console.log('PASS packaged MV3: actual activeTab action, file review, preview, duplicate click, Alice/Bob isolation, overwrite refusal/recovery, native CV selection, cleared memory, zero POST/external requests.');
} finally {await context.close();}
