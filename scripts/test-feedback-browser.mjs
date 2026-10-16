/** Synthetic local browser fixtures using the real user/admin views and shell.
 * Never authenticates, connects to a real DB, or sends production requests. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const out = resolve('output/playwright/feedback');
await mkdir(out, { recursive: true });
const stubs = {
  'next/navigation': `export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({refresh(){}});export const notFound=()=>{throw new Error('notFound')};`,
  'next/link': `import React from 'react';export default function Link({prefetch,...props}){return React.createElement('a',props)}`,
  'next-auth/react': `export const signOut=()=>{};`,
  '@/lib/session': `export const getCurrentUser=async()=>({id:'admin',email:'umbertogeraci0@gmail.com',name:'Local fixture'});`,
  '@/lib/admin-alerts': `export const getAdminAlerts=async()=>[];`,
  '@/components/admin-auto-refresh': `export const AdminAutoRefresh=()=>null;`,
};
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import {SWRConfig} from 'swr';
import {SupportShell} from './src/components/support-shell';import {SupportLink} from './src/components/support-link';import {AppShell} from './src/components/design/app-shell';import {FeedbackView} from './src/components/feedback-view';import {AdminReportsView} from './src/components/admin-reports-view';import AdminLayout from './src/app/(app)/admin/layout';
import it from './messages/it.json';import en from './messages/en.json';
const params=new URLSearchParams(location.search);const locale=params.get('locale')||'en';const admin=location.pathname.startsWith('/admin');
const hostile='<img src="https://tracker.invalid/pixel" onerror="alert(1)"><script>alert(1)</script>';
window.__requests=[];window.__uploaded=[];window.__fail=null;window.__reports=params.has('empty')?[]:Array.from({length:24},(_,i)=>({id:'report'+i,category:i%2?'feedback':'bug',subject:i===0?'Synthetic unsafe markup: '+hostile:'Synthetic report '+i,description:'Synthetic description. Expected a saved preference, but saw no confirmation.\\n'+hostile,pageContext:i%2?'preferences':null,locale:i%2?'it':'en',status:i%3?'new':'in_review',attachments:i===0?[{id:'imagefile',filename:'screenshot.png',contentType:'image/png',byteLength:512,scanStatus:'sanitized'},{id:'pdffile',filename:'document.pdf',contentType:'application/pdf',byteLength:1024,scanStatus:'quarantined'}]:[],createdAt:'2026-10-15T09:00:00Z',updatedAt:'2026-10-15T09:00:00Z',...(admin?{user:{email:'alex@example.invalid',name:'Alex Example'}}:{})}));
window.fetch=async(url,options={})=>{
 const path=String(url);const method=options.method||'GET';window.__requests.push({url:path,method,body:options.body});
 if(!path.startsWith('/api/'))throw new Error('Unexpected request '+path);
 if(path==='/api/sidebar-stats')return Response.json({applicationsCount:12,autoApplyToday:0,autoApplyRemaining:0});
 if(path==='/api/preferences')return Response.json({autoApplyMode:'manual',applicationService:{automaticBlocked:true,submissionsPaused:false,dailyCap:10}});
 if(window.__fail && path.includes(admin?'/reports':'/feedback'))return Response.json({error:window.__fail},{status:window.__fail==='rate_limited'?429:503});
 if(path.includes('/attachments/')){
  const id=path.split('/').at(-1);const owner=window.__reports.find(r=>r.attachments?.some(f=>f.id===id));const file=owner?.attachments.find(f=>f.id===id);
  if(!file)return Response.json({error:'not_found'},{status:404});
  if(method==='DELETE'){owner.attachments=owner.attachments.filter(f=>f.id!==id);return Response.json({ok:true});}
  if(method==='POST'){file.scanStatus='clean';return Response.json({ok:true});}
  return new Response('synthetic download',{headers:{'Content-Type':file.contentType}});
 }
 if(path.startsWith('/api/feedback')||path.startsWith('/api/admin/reports')){
  if(method==='POST') {await new Promise(resolve=>setTimeout(resolve,120));const input=JSON.parse(options.body);const report={...input,id:'newreport',status:'new',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};window.__reports.unshift(report);return Response.json({report},{status:201});}
  const parsed=new URL(path,location.origin);const id=parsed.pathname.split('/')[4];
  if(id){const report=window.__reports.find(r=>r.id===id);if(!report)return Response.json({error:'not_found'},{status:404});if(method==='PATCH'){report.status=JSON.parse(options.body).status;report.updatedAt=new Date().toISOString();return Response.json({ok:true});}return Response.json({report});}
  const page=Number(parsed.searchParams.get('page')||1);let rows=window.__reports;for(const field of ['category','status'])if(parsed.searchParams.get(field))rows=rows.filter(r=>r[field]===parsed.searchParams.get(field));return Response.json({reports:rows.slice((page-1)*20,page*20),page,hasMore:rows.length>page*20});
 }
 return Response.json({});
};
window.XMLHttpRequest=class {
 upload={}; open(method,url){this.method=method;this.url=url;}
 async send(data){
  window.__uploaded=[...data.getAll('files')].map(f=>({name:f.name,type:f.type,size:f.size}));
  this.upload.onprogress?.({lengthComputable:true,loaded:1,total:2});
  await new Promise(r=>setTimeout(r,180));
  this.upload.onprogress?.({lengthComputable:true,loaded:2,total:2});
  await new Promise(r=>setTimeout(r,180));
  if(window.__fail==='network'){this.onerror();return;}
  const response=await window.fetch('/api/feedback',{method:'POST',body:data.get('report')});
  this.status=response.status;const body=await response.json();
  if(response.ok){body.report.attachments=window.__uploaded.map((f,i)=>({id:'file'+i,filename:f.name,contentType:f.type,byteLength:f.size,scanStatus:f.type==='application/pdf'?'clean':'sanitized'}));const saved=window.__reports.find(r=>r.id===body.report.id);if(saved)saved.attachments=body.report.attachments;}
  this.responseText=JSON.stringify(body);this.onload();
 }
};
async function start(){const content=admin?await AdminLayout({children:<AdminReportsView locale={locale}/>}):<FeedbackView locale={locale} standalone pdfEnabled={params.has('pdf')}/>;createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='en'?en:it}><SWRConfig value={{provider:()=>new Map(),dedupingInterval:0,shouldRetryOnError:false}}>{admin?<AppShell sidebarProps={{userName:'Local fixture',userPlan:'Synthetic QA only',isAdmin:admin}}>{content}</AppShell>:<SupportShell locale={locale}>{content}</SupportShell>}</SWRConfig></NextIntlClientProvider>)}start();
`;
await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, define: { 'process.env.ADMIN_EMAILS': 'undefined' }, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: join(out, 'fixture.js'), plugins: [{ name: 'boundaries', setup(b) { b.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined); b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: process.cwd() })); } }] });
execFileSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-i', 'src/app/globals.css', '-o', join(out, 'base.css')], { stdio: 'pipe' });
await writeFile(join(out, 'index.html'), '<!doctype html><html style="--font-inter:Arial"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
const server = createServer(async (req,res) => { const path = new URL(req.url, 'http://localhost').pathname; const file = ['/fixture.js','/fixture.css','/base.css'].includes(path) ? path.slice(1) : 'index.html'; res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'); res.end(await readFile(join(out,file))); });
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes('--serve')) { console.log(base); await new Promise(()=>{}); }
let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[],external=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser fixture error:',error.message)});
 await page.route('**/*',route=>{if(!route.request().url().startsWith(base)&&!route.request().url().startsWith('blob:')){external.push(route.request().url());return route.abort()}return route.continue()});
 let screenshots=0;
 async function shot(name){await page.screenshot({path:join(out,name+'.png'),fullPage:false,animations:'disabled'});screenshots++}
 for(const route of ['feedback','admin/reports'])for(const locale of ['it','en']){
  await page.goto(base+'/'+route+'?locale='+locale);console.log('Checking',route,locale);await page.locator('h1').waitFor();await page.locator('.report-entry').first().waitFor();
  assert.equal(await page.locator('.report-entry img,.report-entry script').count(),0);
  for(const [width,height] of [[1440,900],[1280,720],[390,844],[320,740]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)){console.log(await page.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).slice(0,20)));await shot('overflow-debug');}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' '+locale+' horizontal overflow '+width);
   if(!await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)){console.log(await page.evaluate(()=>({height:innerHeight,doc:document.documentElement.scrollHeight,body:document.body.getBoundingClientRect().toJSON(),shell:document.querySelector('.support-shell')?.getBoundingClientRect().toJSON()})));await shot('vertical-overflow');}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true,route+' document scrolling '+width);
   if(width>=1024)assert.equal(await page.locator(route==='feedback'?'.support-shell > main':'.lavorai-main').evaluate(el=>el.scrollHeight<=el.clientHeight+1),true,route+' desktop main scrolling');
   await shot(route.replace('/','-')+'-'+locale+'-'+width);
  }
  if(route==='feedback'){
   await page.getByRole('link',{name:locale==='en'?'← Back to LavorAI':'← Torna a LavorAI'}).waitFor();
   assert.equal(await page.evaluate(()=>window.__requests.some(r=>r.url==='/api/sidebar-stats'||r.url==='/api/preferences')),false,'support shell must not fetch paid features');
  }
  await page.setViewportSize({width:1440,height:900});
 }
 await page.goto(base+'/feedback?locale=en&empty=1');
 await page.getByText('Your reports and their review status will appear here.').waitFor();
 await shot('feedback-empty');
 assert.equal(await page.locator('#report-page').inputValue(),'');
 await page.getByRole('radio',{name:/Report a bug/}).check();
 await page.locator('#report-subject').fill('Save button stops working');
 await page.locator('#report-description').fill('Select a role and press save. Expected confirmation, nothing happens.');
 await page.locator('#report-page').selectOption('preferences');
 await page.evaluate(()=>window.__fail='rate_limited');
 await page.getByRole('button',{name:'Send report',exact:true}).click();
 await page.getByRole('alert').getByText(/report limit/).waitFor();
 assert.equal(await page.locator('#report-subject').inputValue(),'Save button stops working');
 await shot('feedback-rate-limit');
 await page.evaluate(()=>window.__fail='unavailable');
 await page.getByRole('button',{name:'Send report',exact:true}).click();
 await page.getByRole('alert').getByText(/draft is still here/).waitFor();
 await page.evaluate(()=>window.__fail=null);
 await page.getByRole('button',{name:'Send report',exact:true}).click();
 await page.getByRole('status').getByText(/Report sent/).waitFor();
 await page.getByRole('heading',{name:'Save button stops working'}).waitFor();
 assert.equal(await page.locator('#report-subject').inputValue(),'');
 assert.equal(await page.locator('#report-page').inputValue(),'');
 const payload=await page.evaluate(()=>JSON.parse(window.__requests.filter(r=>r.method==='POST').at(-1).body));
 assert.deepEqual(Object.keys(payload).sort(),['category','description','locale','pageContext','subject']);assert.equal(payload.pageContext,'preferences');assert.equal(payload.category,'bug');
 await shot('feedback-success');
 await page.locator('#report-subject').fill('   ');await page.locator('#report-description').fill('Enough text to pass native validation.');
 const countBefore=await page.evaluate(()=>window.__requests.filter(r=>r.method==='POST').length);
 await page.getByRole('button',{name:'Send report',exact:true}).click();
 await page.getByRole('alert').getByText(/Check the report type/).waitFor();
 assert.equal(await page.evaluate(()=>window.__requests.filter(r=>r.method==='POST').length),countBefore);
 assert.equal(await page.locator('#report-subject').getAttribute('maxlength'),'120');assert.equal(await page.locator('#report-description').getAttribute('maxlength'),'4000');
 await page.goto(base+'/feedback?locale=it');await page.locator('.report-entry').first().waitFor();await page.getByRole('button',{name:'Successiva',exact:true}).click();await page.getByText('Pagina 2',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.report-entry').length===4);assert.equal(await page.locator('.report-entry').count(),4);
 await page.goto(base+'/feedback?locale=en');await page.locator('.report-entry').first().waitFor();await page.locator('.report-entry summary').first().click();
 assert.equal(await page.locator('.report-description img,.report-description script').count(),0);assert.match(await page.locator('.report-description').first().textContent(),/<script>/);
 await page.getByRole('button',{name:'Light theme',exact:true}).first().click();await shot('feedback-light');
 await page.goto(base+'/admin/reports?locale=en');await page.locator('.report-select').first().waitFor();
 await page.locator('.report-select').first().focus();await page.keyboard.press('Enter');await page.locator('.report-detail h2').waitFor();
 assert.equal(await page.locator('.report-detail img,.report-detail script').count(),0);
 await page.locator('.report-triage select').selectOption('resolved');await page.getByRole('button',{name:'Save status',exact:true}).click();await page.getByRole('status').getByText('Status updated.').waitFor();
 assert.equal(await page.evaluate(()=>window.__reports[0].status),'resolved');
 const patch=await page.evaluate(()=>window.__requests.find(r=>r.method==='PATCH'));assert.deepEqual(JSON.parse(patch.body),{status:'resolved'});
 await shot('admin-detail');
 await page.locator('.report-filters select').nth(1).selectOption('resolved');await page.waitForFunction(()=>document.querySelectorAll('.report-select').length===1);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Save status',exact:true}).scrollIntoViewIfNeeded();await shot('admin-detail-mobile');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(base+'/admin/reports?locale=it&empty=1');await page.getByText('Nessuna segnalazione corrisponde ai filtri.').waitFor();await shot('admin-empty-mobile');

 // Picker, preview, removal, retained files on failure, progress and quarantine UX.
 await page.goto(base+'/feedback?locale=it&empty=1');
 assert.equal(await page.locator('input[type=file]').getAttribute('accept'),'.png,.jpg,.jpeg,.webp');
 await page.getByText(/Il caricamento PDF non è al momento disponibile/).waitFor();
 await page.locator('input[type=file]').setInputFiles([{name:'disabled.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic browser fixture')}]);
 await page.getByRole('alert').getByText(/Rimuovi il PDF/).waitFor();
 assert.equal(await page.locator('.report-file-list li').count(),0);
 await page.getByRole('alert').scrollIntoViewIfNeeded();
 await shot('pdf-upload-disabled');
 await page.goto(base+'/feedback?locale=it&empty=1&pdf=1');
 await page.locator('#report-subject').fill('Screenshot problema sintetico');
 await page.locator('#report-description').fill('Segnalazione locale sintetica con allegati di prova.');
 const pngFixture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jw1kAAAAASUVORK5CYII=','base64');
 await page.locator('input[type=file]').setInputFiles([{name:'screen.png',mimeType:'image/png',buffer:pngFixture}]);
 await page.locator('.report-file-preview').waitFor();
 await page.getByRole('button',{name:'Rimuovi: screen.png',exact:true}).click();assert.equal(await page.locator('.report-file-preview').count(),0);
 await page.locator('input[type=file]').setInputFiles([{name:'screen.png',mimeType:'image/png',buffer:pngFixture},{name:'evidence.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic browser fixture')}]);
 for(const [width,height] of [[1440,900],[390,844],[320,740]]){
  await page.setViewportSize({width,height});await page.locator('.report-attachment-picker').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot('attachment-picker-'+width);
 }
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>window.__fail='network');
 await page.getByRole('button',{name:'Invia segnalazione',exact:true}).click();
 await page.locator('progress').waitFor();assert.equal(await page.getByRole('button',{name:'Rimuovi: screen.png',exact:true}).isDisabled(),true);
 await page.getByRole('alert').getByText(/bozza è ancora qui/).waitFor();assert.equal(await page.locator('.report-file-preview').count(),1);
 await page.evaluate(()=>window.__fail=null);await page.getByRole('button',{name:'Invia segnalazione',exact:true}).click();
 await page.getByRole('status').getByText(/Segnalazione inviata/).waitFor();
 assert.equal(await page.locator('.report-file-preview').count(),0);
 assert.equal(await page.evaluate(()=>window.__uploaded.length),2);
 await page.locator('.report-entry summary').first().click();await page.getByText(/Scansione di sicurezza superata/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Scarica: evidence.pdf'}).count(),1);
 await shot('attachment-submitted-scanned');
 await page.getByRole('button',{name:'Rimuovi: evidence.pdf',exact:true}).click();await page.getByText(/Scansione di sicurezza superata/).waitFor({state:'hidden'});
 await page.locator('input[type=file]').setInputFiles([{name:'a.png',mimeType:'image/png',buffer:Buffer.alloc(3*1024*1024+1)}]);
 await page.getByRole('alert').getByText(/3 MB/).waitFor();
 await page.locator('input[type=file]').setInputFiles([{name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')}]);
 await page.getByRole('alert').getByText(/File non valido/).waitFor();
 await page.locator('input[type=file]').setInputFiles(Array.from({length:4},(_,i)=>({name:'file'+i+'.png',mimeType:'image/png',buffer:pngFixture})));
 await page.getByRole('alert').getByText(/massimo 3 file/).waitFor();
 await page.goto(base+'/admin/reports?locale=en');await page.locator('.report-select').first().click();
 await page.getByRole('button',{name:'Check PDF',exact:true}).click();await page.getByRole('button',{name:'Download: document.pdf',exact:true}).waitFor();
 await shot('admin-attachments-clean');

 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(join(out,'qa-result.json'),JSON.stringify({passed:true,fixtureOnly:true,screenshots,errors,external,checks:['IT/EN at 1440,1280,390,320','no document scrolling','desktop main fits viewport','user submission and draft retention','optional explicit context','native/client validation','safe text rendering','history pagination','admin detail, filters, triage','support shell without paid feature requests','light theme','attachment picker/preview/remove at desktop and mobile','upload progress and retained drafts','unconfigured PDF uploads disabled; configured PDF scan UX; legacy quarantine']},null,2));
 console.log('PASS local fixture browser QA: IT/EN, four viewports, no document scroll, user submission/errors, admin triage, text safety, pagination, support isolation, attachments/quarantine, light theme. '+screenshots+' screenshots. No external requests.');
} finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
