import {checkControl} from './control';
import { randomUUID,createHash } from 'node:crypto';
import type { Browser, Page } from 'playwright';
import {documents,chooseDocument,digest,facts,validateAnswer,candidate,type DemoScenario,type DemoDocument,type Pending} from './facts';
export type BrowserEngineId = 'chromium'|'obscura';
export const browserEngines = {chromium:{available:true,mode:'local fixture'},obscura:{available:false,reason:'Not installed or validated'}} as const;
export type Action = 'prepare'|'pause'|'take'|'answer'|'return'|'submit'|'uncertain'|'close'|'input'|'manual'|'resolve'|'restore';
export type BrowserInput={kind:'click'|'key'|'text'|'scroll';x?:number;y?:number;key?:string;text?:string;delta?:number};
type State = {scenario:DemoScenario;docs:DemoDocument[];selected:DemoDocument[];pending:Pending[];uploadEvidence:ReturnType<typeof digest>[];receiptEvidence:unknown;id:string;owner:string;revision:number;controller:'agent'|'human'|'none';status:string;expiresAt:number;answer:string;posts:number;submitStarted:boolean;receipt:string|null;events:string[];browser:Browser;page:Page;busy:boolean;timer?:ReturnType<typeof setTimeout>};
const fixtureUrl='https://fixture.invalid/application';
const fixture=`<!doctype html><html><head><style>body{font:16px system-ui;background:#f5f7f6;color:#17251f;margin:0;padding:36px}main{max-width:570px;margin:auto}small{color:#587367}h1{font-size:30px}label{display:block;margin:20px 0 6px}input[type=checkbox],input[type=radio]{width:auto}input,select{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b9c7bf;border-radius:8px;background:white;color:#17251f}button{background:#237a51;color:white;padding:14px 22px;border:0;border-radius:8px;margin-top:24px}.notice{padding:12px;background:#e3eee7;border-radius:8px}</style></head><body><main><small>LOCAL FIXTURE · NOT AN EMPLOYER</small><h1>Product Designer</h1><p>Studio Example · Synthetic application</p><div class="notice">No data leaves this isolated browser.</div><form><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Synthetic CV<input name="cv" type="file" required></label><label>Preferred work arrangement<select name="arrangement" required><option value="">Choose your answer</option><option>Remote</option><option>Hybrid</option></select></label><label>Approved cover letter (required)<input name="letter" type="file" required></label><label>Professional headline<input name="headline" required></label><label>Years of product design<input name="years" type="number" min="0" max="80" required></label><label>Available from<input name="start" type="date" required></label><fieldset><legend>Preferred contact method</legend><label><input type="radio" name="contact" value="Email" required>Email</label><label><input type="radio" name="contact" value="Phone">Phone</label></fieldset><label><input type="checkbox" name="figma">I use Figma (skill fact, not consent)</label><div id=manual hidden><p>SIMULATED VERIFICATION — no real login or CAPTCHA. Only the person may acknowledge this local fixture.</p><label><input type=checkbox name=manualAck> I completed the synthetic manual step</label></div><button>Submit local fixture</button></form><p id="result"></p></main><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();if(!window.fixtureSubmitAllowed)return;window.fixtureSubmitAllowed=false;const r=await fetch('/candidate',{method:'POST',body:new FormData(e.target)});const data=await r.json();document.querySelector('#result').textContent=r.status===201?'Fixture receipt: '+data.id:'Fixture rejected upload';};</script></body></html>`;
export class WorkspaceEngine {
 sessions=new Map<string,State>();
 private creating=new Set<string>();
 constructor(private ttl=10*60_000){}
 async create(owner:string,engineId:BrowserEngineId='chromium',scenario:DemoScenario='standard'){
  if(!['standard','ambiguous_cv','missing_letter','unsupported','upload_rejection'].includes(scenario))throw Error('Unknown synthetic scenario');
  if(engineId!=='chromium')throw Error('Obscura is unavailable; no silent engine substitution');
  if(this.creating.has(owner))throw Error('Session creation already in progress');
  if([...this.sessions.values()].filter(s=>!['expired','closed','unknown','accepted'].includes(s.status)).length+this.creating.size>=3)throw Error('Local session capacity reached. Close an existing session.');
  if([...this.sessions.values()].some(s=>s.owner===owner&&!['closed','expired'].includes(s.status)))throw Error('A session already exists for this local owner.');
  this.creating.add(owner);
  try {
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true,env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'',TMPDIR:process.env.TMPDIR||'/tmp'}});
  const context=await browser.newContext({viewport:{width:800,height:720},serviceWorkers:'block'});const page=await context.newPage();
  const s={scenario,docs:documents(scenario).filter(d=>scenario!=='missing_letter'||d.kind!=='letter'),selected:[],pending:[],uploadEvidence:[],receiptEvidence:null,id:'demo_'+randomUUID(),owner,revision:0,controller:'agent',status:'ready',expiresAt:Date.now()+this.ttl,answer:'',posts:0,submitStarted:false,receipt:null,events:['Local Chromium connected. Only synthetic fixture data is available.'],browser,page,busy:false} as State;
  await context.route('**/*',async route=>{const r=route.request();if(r.url()===fixtureUrl&&r.method()==='GET')return route.fulfill({contentType:'text/html; charset=utf-8',body:fixture});if(r.url()==='https://fixture.invalid/candidate'&&r.method()==='POST'&&s.submitStarted&&s.status==='submitting'&&Date.now()<s.expiresAt&&s.posts===0){s.posts++;try{const payload=r.postDataBuffer();if(!payload)throw Error('Missing multipart payload');const form=await new Request('http://fixture.invalid',{method:'POST',headers:{'content-type':r.headers()['content-type']},body:new Uint8Array(payload)}).formData();const received=[];for(const d of s.selected){const file=form.get(d.kind==='cv'?'cv':'letter');if(!file||typeof file==='string')throw Error('Required file missing');const bytes=Buffer.from(await file.arrayBuffer());const hash=createHash('sha256').update(bytes).digest('hex');if(file.name!==d.name||file.type!==d.type||hash!==digest(d).sha256)throw Error('Fixture rejected mismatched document');received.push({...digest(d),received:true});}if(received.length!==2||s.scenario==='upload_rejection')throw Error('Fixture rejected upload');s.receiptEvidence={documents:received,answers:{headline:form.get('headline'),years:form.get('years'),start:form.get('start'),contact:form.get('contact'),figma:form.get('figma')==='on',arrangement:form.get('arrangement')}};return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({id:'fixture_'+s.id,evidence:s.receiptEvidence})});}catch{return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:'Fixture upload validation rejected'})});}}return route.abort();});
  browser.on('disconnected',()=>{if(!['accepted','rejected','closed','expired','unknown'].includes(s.status)){s.status=s.submitStarted?'unknown':'disconnected';s.controller='none';s.revision++;s.events.push('Local browser disconnected. No automatic restart or submission retry.');}});
  try{await page.goto(fixtureUrl);this.sessions.set(s.id,s);s.timer=setTimeout(()=>{s.status=['accepted','rejected','closed'].includes(s.status)?s.status:s.submitStarted&&!s.receipt?'unknown':'expired';s.controller='none';s.revision++;void browser.close();},this.ttl);s.timer.unref();return this.view(s);}catch(e){await browser.close();throw e;}
  } finally {this.creating.delete(owner);}
 }
 private get(id:string,owner:string){const s=this.sessions.get(id);if(!s||s.owner!==owner)throw Error('Session unavailable');return s;}
 private view(s:State){return {pending:s.pending,documents:s.docs.map(digest),selectedDocuments:s.selected.map(d=>({...digest(d),content:d.content})),facts,uploadEvidence:s.uploadEvidence,receiptEvidence:s.receiptEvidence,id:s.id,revision:s.revision,controller:s.controller,status:s.status,expiresAt:s.expiresAt,answer:s.answer,posts:s.posts,receipt:s.receipt,events:[...s.events],engine:'Chromium · real local fixture',obscura:'Unavailable — not installed or tested'};}
 async snapshot(id:string,owner:string){const s=this.get(id,owner);const image=['closed','expired','unknown','disconnected'].includes(s.status)?null:await s.page.screenshot({type:'jpeg',quality:65}).then(b=>'data:image/jpeg;base64,'+b.toString('base64')).catch(()=>null);return {...this.view(s),image};}
 async act(id:string,owner:string,revision:number,action:Action,answer?:string,input?:BrowserInput,resolution?:{key:string;value:unknown}){
  const s=this.get(id,owner);if(s.busy||revision!==s.revision)throw Error('Control changed. Refresh before acting.');
  if(action==='close'){s.controller='none';s.status=s.submitStarted&&!s.receipt&&s.status!=='rejected'?'unknown':'closed';s.revision++;clearTimeout(s.timer);await s.browser.close();return this.view(s);}
  checkControl(s,owner,revision);
  s.busy=true;s.revision++;
  try{
   if(action==='input'){
    if(s.controller!=='human'||s.submitStarted)throw Error('Human control required for browser input');
    if(!input||s.page.url()!==fixtureUrl)throw Error('Invalid fixture input');
    if(input.kind==='click'){
     if(!Number.isFinite(input.x)||!Number.isFinite(input.y)||input.x!<0||input.x!>=800||input.y!<0||input.y!>=720)throw Error('Invalid pointer coordinates');
     const safe=await s.page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);return !!el&&!el.closest('button,a,input[type=file]');},{x:input.x!,y:input.y!});
     if(!safe)throw Error('File selection and submission use the reviewed workspace controls');
     await s.page.mouse.click(input.x!,input.y!);
    }else if(input.kind==='text'){
     if(typeof input.text!=='string'||input.text.length>200)throw Error('Text input is too long');
     const editable=await s.page.evaluate(()=>document.activeElement?.matches('input:not([type=file]),textarea'));
     if(!editable)throw Error('Click a text field first');await s.page.keyboard.insertText(input.text);
    }else if(input.kind==='key'){
     const keys=['Backspace','Delete','Tab','Shift+Tab','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Space'];
     if(!keys.includes(input.key||''))throw Error('Unsupported key');
     const safe=await s.page.evaluate(()=>!document.activeElement?.matches('button,a,input[type=file]'));
     if(!safe&&input.key!=='Tab'&&input.key!=='Shift+Tab')throw Error('Use the reviewed workspace controls for this element');
     const select=s.page.locator('select:focus');
     if(await select.count()&&['ArrowDown','ArrowUp'].includes(input.key!)){
      const next=await select.evaluate((el,key)=>{const s=el as HTMLSelectElement;return s.options[Math.max(0,Math.min(s.options.length-1,s.selectedIndex+(key==='ArrowDown'?1:-1)))].value;},input.key!);
      await select.selectOption(next);
     }else if(['Home','End'].includes(input.key!)){const handled=await s.page.evaluate(key=>{const el=document.activeElement;if(el instanceof HTMLInputElement&&['text','search','tel','url'].includes(el.type)||el instanceof HTMLTextAreaElement){const target=el as HTMLInputElement|HTMLTextAreaElement;const position=key==='Home'?0:target.value.length;target.setSelectionRange(position,position);return true;}return false;},input.key!);if(!handled)await s.page.keyboard.press(input.key!);}else await s.page.keyboard.press(input.key!);
    }else if(input.kind==='scroll'){
     if(!Number.isFinite(input.delta)||Math.abs(input.delta!)>720)throw Error('Invalid scroll');await s.page.mouse.wheel(0,input.delta!);
    }else throw Error('Unsupported browser input');
    s.answer=await s.page.locator('[name=arrangement]').inputValue();if(['Remote','Hybrid'].includes(s.answer))s.pending=s.pending.filter(p=>p.key!=='arrangement');else if(!s.pending.some(p=>p.key==='arrangement'))s.pending.push({key:'arrangement',label:'Preferred work arrangement',type:'select',options:['Remote','Hybrid'],reason:'Explicit answer required.'});
    if(!['ready','manual_required'].includes(s.status))s.status=s.answer&&!s.pending.length?'prepared':'needs_answer';
   }
   else if(action==='pause'){s.controller='none';s.events.push('Paused. Neither controller may write.');}
   else if(action==='take'){s.controller='human';s.events.push('You have exclusive control. Agent writes are disabled.');}
   else if(action==='return'){if(s.controller!=='human')throw Error('Human control required');if(s.status==='manual_required'){if(!await s.page.locator('[name=manualAck]').isChecked())throw Error('Complete the synthetic verification checkbox before returning control');s.status=s.answer&&!s.pending.length?'prepared':'needs_answer';s.events.push('Synthetic manual step verified. Agent can resume.');}s.controller='agent';s.events.push('Control returned to the deterministic assistant.');}
   else if(action==='answer'){if(s.controller==='none'||!['needs_answer','prepared'].includes(s.status))throw Error('Resume the paused workflow before answering');if(!['Remote','Hybrid'].includes(answer||''))throw Error('Choose one of the fixture answers');await s.page.selectOption('[name=arrangement]',{label:answer!});s.answer=answer!;s.pending=s.pending.filter(p=>p.key!=='arrangement');s.status=s.pending.length?'needs_answer':'prepared';s.events.push('Your chat answer was supplied to the assistant and entered in the local browser. No takeover needed.');}
   else if(action==='restore'){if(s.controller!=='agent'||!['prepared','needs_answer'].includes(s.status))throw Error('Agent review control required');await this.fillKnown(s);s.events.push('After explicit review, saved synthetic facts and selected documents were restored. No new facts inferred.');}
   else if(action==='resolve'){
    if(s.controller!=='agent'||!resolution||!s.pending.some(p=>p.key===resolution.key))throw Error('An active chat question and agent control are required');
    const {key,value}=resolution;
    if(key==='cv'){const d=chooseDocument(s.docs,'cv',String(value));if(!d)throw Error('Unverified document');s.selected=s.selected.filter(d=>d.kind!=='cv');s.selected.push(d);}
    else if(key==='letterContent'){const content=String(validateAnswer(key,value));const d:DemoDocument={id:'chat-letter',owner:candidate,kind:'letter',role:'Product Designer',version:1,approved:true,name:'Alex_approved_chat_letter.txt',type:'text/plain',content};s.docs.push(d);s.selected.push(d);}
    else if(key==='arrangement'){s.answer=String(validateAnswer(key,value));await s.page.selectOption('[name=arrangement]',s.answer);}
    else throw Error('Unsupported question requires adapter support; not guessed');
    s.pending=s.pending.filter(p=>p.key!==key);await this.fillKnown(s);s.status=s.pending.length?'needs_answer':'prepared';s.events.push('Explicit chat resolution recorded: '+key+'. Agent resumed without takeover.');
   }
   else if(action==='manual'){if(s.controller!=='agent'||!['needs_answer','prepared'].includes(s.status))throw Error('Prepare the fixture first');await s.page.locator('#manual').evaluate(el=>{(el as HTMLElement).hidden=false});s.status='manual_required';s.controller='none';s.events.push('Synthetic manual verification requires your interaction. Take control, acknowledge the fixture checkbox, then return control. This is not a real CAPTCHA or login.');}
   else if(action==='prepare'){if(s.controller!=='agent'||s.status!=='ready')throw Error('Agent control and a fresh session required');await s.page.fill('[name=name]','Alex Example');await s.page.fill('[name=email]','alex@example.invalid');s.pending=[{key:'arrangement',label:'Preferred work arrangement',type:'select',options:['Remote','Hybrid'],reason:'No saved fact; answer explicitly in chat.'}];
    for(const kind of ['cv','letter'] as const){const d=chooseDocument(s.docs,kind);if(d)s.selected.push(d);else s.pending.push({key:kind==='cv'?'cv':'letterContent',label:kind==='cv'?'Choose the pertinent CV':'Supply an approved synthetic cover letter',type:kind==='cv'?'select':'text',options:kind==='cv'?s.docs.filter(d=>d.owner===candidate&&d.kind==='cv'&&d.role==='Product Designer').map(d=>d.id):undefined,reason:kind==='cv'?'Multiple equally relevant approved versions; no guess.':'Required letter absent. Supply SYNTHETIC content; no career facts invented.'});}
    if(s.scenario==='unsupported')s.pending.push({key:'unsupported',label:'Unrecognized custom question',type:'text',reason:'Unsupported schema. Cannot safely answer or submit.'});
    await this.fillKnown(s);s.status='needs_answer';s.events.push('Role-relevant owned documents selected by exact role and approval. Saved typed facts filled; missing or ambiguous information stays in chat.');
   }
   else if(action==='submit'||action==='uncertain'){
    if(s.controller!=='agent'||s.status!=='prepared'||!s.answer||s.submitStarted)throw Error('Prepared data, answer and agent control required');
    await this.verifyReady(s);s.submitStarted=true;s.status='submitting';
    if(action==='uncertain'){s.status='unknown';s.controller='none';s.events.push('Simulated transport uncertainty. Submission marker retained; retry is blocked.');await s.browser.close();}
    else {await s.page.evaluate(()=>{(window as unknown as {fixtureSubmitAllowed:boolean}).fixtureSubmitAllowed=true;});await s.page.locator('button').click();await s.page.waitForFunction(()=>/Fixture receipt:|Fixture rejected upload/.test(document.querySelector('#result')?.textContent||''),{},{timeout:3000});if(s.posts!==1)throw Error('Unexpected fixture POST count');if(!s.receiptEvidence){s.status='rejected';s.controller='none';s.events.push('Local fixture rejected upload with HTTP 422. No success claimed and no automatic retry.');return this.view(s);}s.receipt='fixture_'+s.id;s.status='accepted';s.controller='none';s.events.push('Local fixture returned HTTP 201 with a receipt. No employer was contacted.');}
   }else throw Error('Unsupported action');
   return this.view(s);
  }catch(e){if(s.submitStarted&&!s.receipt){s.status='unknown';s.controller='none';s.events.push('Outcome uncertain. No retry permitted.');}throw e;}finally{s.busy=false;}
 }
 private async fillKnown(s:State){
  await s.page.fill('[name=name]','Alex Example');await s.page.fill('[name=email]','alex@example.invalid');
  for(const d of s.selected)await s.page.locator(`[name=${d.kind==='cv'?'cv':'letter'}]`).setInputFiles({name:d.name,mimeType:d.type,buffer:Buffer.from(d.content)});
  await s.page.fill('[name=headline]',facts.headline.value);await s.page.fill('[name=years]',String(facts.years.value));await s.page.fill('[name=start]',facts.start.value);await s.page.check('[name=contact][value=Email]');await s.page.setChecked('[name=figma]',facts.figma.value);
  s.uploadEvidence=[];for(const d of s.selected){const actual=await s.page.locator(`[name=${d.kind==='cv'?'cv':'letter'}]`).evaluate(async el=>{const f=(el as HTMLInputElement).files?.[0];return f?{name:f.name,type:f.type,content:await f.text()}:null;});if(!actual||actual.name!==d.name||actual.type!==d.type||actual.content!==d.content)throw Error('Browser upload verification failed');s.uploadEvidence.push(digest(d));}
 }
 private async verifyReady(s:State){
  if(await s.page.inputValue('[name=name]')!=='Alex Example'||await s.page.inputValue('[name=email]')!=='alex@example.invalid')throw Error('Contacts contradict the synthetic owner; restore reviewed facts');
  if(s.pending.length||s.selected.length!==2)throw Error('Required answers/documents remain unresolved');
  for(const d of s.selected){chooseDocument(s.docs,d.kind,d.id);const actual=await s.page.locator(`[name=${d.kind==='cv'?'cv':'letter'}]`).evaluate(async el=>{const f=(el as HTMLInputElement).files?.[0];return f?{name:f.name,type:f.type,text:await f.text()}:null;});if(!actual||actual.name!==d.name||actual.type!==d.type||actual.text!==d.content)throw Error('Document changed or missing: review required');}
  validateAnswer('headline',await s.page.inputValue('[name=headline]'));validateAnswer('years',Number(await s.page.inputValue('[name=years]')));validateAnswer('start',await s.page.inputValue('[name=start]'));validateAnswer('contact',await s.page.locator('[name=contact]:checked').inputValue());validateAnswer('figma',await s.page.isChecked('[name=figma]'));if(await s.page.inputValue('[name=arrangement]')!==s.answer)throw Error('Answer changed: review required');
  if(!await s.page.locator('form').evaluate(el=>(el as HTMLFormElement).checkValidity()))throw Error('Required field validation failed');
 }
 async destroy(){for(const s of this.sessions.values()){clearTimeout(s.timer);await s.browser.close();}this.sessions.clear();}
}
const globalEngine=globalThis as typeof globalThis & {localWorkspaceEngine?:WorkspaceEngine};
export const engine=globalEngine.localWorkspaceEngine??=new WorkspaceEngine();
