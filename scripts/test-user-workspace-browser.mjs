/** Local synthetic fixtures around the real UI. No database, provider, email,
 * checkout, application submission or production request is permitted. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const out = resolve(process.env.WORKSPACE_SCREENSHOT_DIR || 'output/playwright/user-workspace');
await mkdir(out, { recursive: true });
const fontFile = process.env.WORKSPACE_FONT_FILE;
const fontCss = fontFile ? '@font-face{font-family:WorkspaceInter;font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,'+(await readFile(fontFile)).toString('base64')+') format("woff2");}' : '';
const fixtureFont = fontFile ? 'WorkspaceInter' : 'Arial';
const stub = {
  'next/navigation': `export const usePathname = () => location.pathname; const router = { refresh() { window.__refreshes++; }, push(url) { window.__navigation = url; } }; export const useRouter = () => router; const params = new URLSearchParams(location.search); export const useSearchParams = () => params;`,
  'next/link': `import React from 'react'; export default function Link({ prefetch, ...props }) { return React.createElement('a', props); }`,
  'next/dynamic': `import React from 'react'; export default function dynamic(loader) { const Component = React.lazy(() => loader().then(component => ({default: component.default ?? component}))); return props => <React.Suspense fallback={<div>Loading map…</div>}><Component {...props} /></React.Suspense>; }`,
  'next-auth/react': `export const signOut = () => {};`,
  'next-intl/server': `export const getLocale = async () => window.__locale; export const getTranslations = async namespace => (key, values={}) => Object.entries(values).reduce((text,[name,value])=>text.replace("{"+name+"}",value),window.__messages[namespace][key] ?? key);`,
  '@/lib/session': `export const getCurrentUser = async () => ({ id: 'fixture', name: 'Alex Example', email: 'alex@example.test', welcomeSeenAt: new Date() });`,
  '@/lib/db': `export const prisma = { application: { count: async query => window.__empty ? 0 : query.where.userStatus === 'offerta' ? 1 : 2, findMany: async query => !window.__dense ? [] : query.select.interviewSessions ? Array.from({length:3},(_,i)=>({id:'interview-'+i,createdAt:new Date(),lastReplyAt:new Date(),job:{title:'Senior Engineer — accessibility and international product platforms',company:'Synthetic Interview Company '+i},interviewSessions:[]})) : [{id:'accepted-fixture',userId:'fixture',status:'success',submittedVia:'email_recruiter',emailAttempts:[{status:'accepted',providerEmailId:'synthetic-proof',acceptedAt:new Date()}]}] } };`,
  '@/lib/onboarding': `export const getOnboardingState = async () => ({ hasUploadedCv: !window.__dense, hasSetPreferences: !window.__dense, hasFirstApplication: !window.__dense });`,
  '@/lib/dashboard-globe-data': `export const getDashboardGlobeData = async () => window.__globe; export const angularDistance = (a,b,c,d) => Math.acos(Math.max(-1,Math.min(1,Math.sin(a*Math.PI/180)*Math.sin(c*Math.PI/180)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.cos((b-d)*Math.PI/180))))*180/Math.PI;`,
  '@/lib/auto-apply-readiness': `export const getAutoApplyReadiness = async () => ({ tone: 'action', eyebrow: 'Candidature', title: 'Solo candidature confermate', detail: "L'invio automatico è sospeso. Il servizio accetta soltanto nuove candidature confermate esplicitamente, con un limite complessivo di 10 invii al giorno (UTC). Le tue preferenze restano salvate.", href: '/jobs', cta: 'Vedi le offerte' });`,
  '@/components/welcome-modal': `export const WelcomeModal = () => null;`,
  '@/components/post-login-checkout': `export const PostLoginCheckout = () => null;`,
  '@/components/gmail-connect-modal': `export const GmailConnectModal = ({open}) => open ? <div role="dialog">Gmail connection fixture</div> : null;`,
  '@/components/design/company-logo-image': `export function CompanyLogoImage({initials,color,size,rounded}) { return <span style={{display:'grid',placeItems:'center',width:size,height:size,flexShrink:0,background:color,borderRadius:rounded,color:'white'}}>{initials}</span>; }`,
};
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { SWRConfig } from 'swr';
import { Toaster } from 'sonner';
import { AppShell } from './src/components/design/app-shell';
import { AppTopbar } from './src/components/design/topbar';
import { GmailInboxView } from './src/components/gmail-inbox-view';
import { JobSwiper, DiscoverHeading } from './src/components/job-swiper';
import ApplicationsPage from './src/app/(app)/applications/page';
import { pipelineLane } from './src/lib/application-pipeline';
import { APPLICATION_LANES, pageWindow } from './src/lib/application-pagination';
import DashboardPage from './src/app/(app)/dashboard/page';
import { MaterialiView } from './src/app/(app)/materiali/materiali-view';
import './src/app/(app)/materiali/materiali.css';
import it from './messages/it.json'; import en from './messages/en.json';
window.__locale = new URLSearchParams(location.search).get('locale') || 'it';
window.__messages = window.__locale === 'en' ? en : it;
window.__empty = new URLSearchParams(location.search).has('empty');
window.__dense = new URLSearchParams(location.search).has('dense');
window.__requests = []; window.__refreshes = 0;
const now = new Date().toISOString();
const jobs = ['Senior React Engineer', 'Product Designer', 'Platform Engineer', 'Frontend Developer'].map((title,i) => ({ id:'job-'+i, title, company:['Example Studio','Sample Labs','Demo Cloud','Example Works'][i], location:['Milano, Italia','Berlin, Germany','Remote EU','London, UK'][i], description:'React TypeScript design systems and accessible interfaces. Work with the product team to build reliable customer experiences. Experience with SQL, Git and automated testing is useful. This is a local synthetic job fixture.', url:'https://example.test/jobs/'+i, contractType:'permanent', remote:new URLSearchParams(location.search).has('onsite')?false:i!==1, salaryMin:i===1?null:60000, salaryMax:i===1?null:80000, postedAt:now, matchScore:i===0?null:88-i }));
const phases = ['confirmed','accepted','pending','delivered','manual','failed'];
const labels = ['Ricevuta ATS verificata','Email accettata dal provider','Risposte necessarie','Email consegnata','Invio dichiarato da te','Non inviata'];
const applications = window.__empty ? [] : phases.map((phase,i) => ({ id:'app-'+i, status:i===2?'needs_answers':i===5?'failed':'success', portal:'greenhouse', atsScore:i===0?null:80+i, suggestions:[], createdAt:now, errorMessage:null, coverLetterText:i%2?'Dear hiring team, this is a synthetic cover letter used only for local browser verification.':null, hasCvDocx:true, hasCoverLetterDocx:i%2===1, hasCvPdf:false, cvLanguage:i%2?'en':'it', userStatus:i===3?'colloquio':i===4?'offerta':null, viewedAt:i===1?now:null, submittedVia:phase==='manual'?'manual':'portal_greenhouse', submittedAt:phase==='confirmed'?now:null, lastReplyAt:i===3?now:null, replyCount:i===3?1:0, lastReplyKind:i===3?'colloquio':null, submitConfirmation:null, delivery:{phase,label:labels[i],detail:'Stato documentato della candidatura di prova.',tone:'neutral'}, deliveryRecipient:null, job:{ ...jobs[i%4], source:'greenhouse' } }));
if(window.__dense && applications.length) {
  const originals=applications.slice();
  applications.push(...Array.from({length:54},(_,i)=>({...originals[i%originals.length],id:'dense-'+i,job:{...originals[i%originals.length].job,title:originals[i%originals.length].job.title+' — Design systems and accessibility for international customer platforms'}})));
  applications[2].status='awaiting_consent';
}
if(new URLSearchParams(location.search).has('pagination') && applications.length) {
  const originals=applications.slice(0,6);
  applications.splice(0,applications.length,...Array.from({length:720},(_,i)=>({...originals[i%6],id:'page-'+String(i).padStart(4,'0'),createdAt:new Date(Date.now()-i*3600_000).toISOString(),job:{...originals[i%6].job,title:originals[i%6].job.title+' #'+i}})));
  applications[2].status='awaiting_consent';
}
window.__applicationResponseSizes=[];
const messages = window.__empty ? [] : applications.slice(0,4).map((a,i)=> ({id:'application_reply:'+i, source:i===3?'gmail':'application_reply', from:'Recruiter '+i+' <recruiter@example.test>', subject:['Interview availability','Application received','Delivery failed','Role update'][i], snippet:'Thank you for your interest in this position.', bodyText:'Hello Alex,\\n\\nThank you for your interest. Can we arrange a conversation next week?\\n\\nThis is a synthetic message for browser QA.\\n<img src="https://tracker.invalid/pixel"><script>alert(1)</script>', date:now, kind:['colloquio','ricevuta','bounce','risposta'][i], label:['Possible interview','Application receipt','Delivery failure','Possible recruiter reply'][i], read:i===3?false:null, applicationId:a.id, applicationStatus:a.userStatus, company:a.job.company, jobTitle:a.job.title, jobRelated:true}));
if(window.__dense && messages.length) {
  const originals=messages.slice();
  messages.push(...Array.from({length:96},(_,i)=>({...originals[i%4],id:'dense-message-'+i})));
  messages[0].bodyText=Array.from({length:60},()=>messages[0].bodyText).join('\\n\\n');
}
const materials = applications.map(a => ({id:a.id,title:a.job.title,company:a.job.company,location:a.job.location,jobUrl:a.job.url,createdAt:a.createdAt,completedAt:null,status:a.status,submittedVia:a.submittedVia,delivery:a.delivery,hasPdf:false,hasDocx:true,hasLetter:a.hasCoverLetterDocx,letterText:a.coverLetterText,language:a.cvLanguage,match:a.atsScore,lastReplyAt:a.lastReplyAt,lastReplyKind:a.lastReplyKind}));
window.__globe = { markers: window.__empty ? [] : [{ key:'milan', name:'Milano', country:'IT', lat:45.46,lng:9.19,counts:{open:4,sent:0,desired:0,saved:0},jobs:jobs.map(j=>({...j,href:'/jobs/'+j.id,match:j.matchScore,kind:'open',isNew:false})),isNew:false}], stats:{analyzed:window.__empty?0:4,compatible:window.__empty?0:4,newOpportunities:0,counts:{open:window.__empty?0:4,sent:0,desired:0,saved:0}}, featuredKeys:[] };
if(window.__dense) {
  window.__globe.markers.push(...['DE','GB','US'].map((country,i)=>({...window.__globe.markers[0],key:'country-'+i,name:'Synthetic City '+i,country,lat:40+i,lng:-30+i*20})));
}
if(new URLSearchParams(location.search).has('globeLabels')) {
  const counts={open:1,sent:1,desired:1,saved:1}; window.__globe.markers[0].counts=counts; window.__globe.stats.counts=counts;
  window.__globe.markers[0].jobs.forEach((job,i)=>job.kind=['open','sent','desired','saved'][i]);
}
window.fetch = async (url, options={}) => {
  window.__requests.push({url:String(url),method:options.method||'GET',body:options.body});
  if(String(url).includes('/api/applications/apply')) return new Response(JSON.stringify({message:'Synthetic blocked submission'}),{status:403});
  if(String(url).includes('/cv-preview')) return Response.json({text:(window.__dense ? 'Long synthetic CV paragraph for scroll testing. '.repeat(400)+'\\n\\n' : '')+'Alex Example\\nFrontend Engineer\\n\\nSUMMARY\\nSynthetic CV document for local testing.\\n\\nEXPERIENCE\\nExample Studio — Frontend Engineer\\nBuilt accessible web interfaces with React and TypeScript.\\n\\nSKILLS\\nReact · TypeScript · SQL · Testing'});
  if(String(url).startsWith('/api/applications?')) {
    if(window.__applicationDelayMs) await new Promise(resolve=>setTimeout(resolve,window.__applicationDelayMs));
    if(new URLSearchParams(location.search).has('error')) return new Response('{}',{status:503});
    if(window.__failNextApplications) {window.__failNextApplications=false;return new Response('{}',{status:503});}
    const params=new URL(String(url),location.origin).searchParams;
    const source=window.__removeApplications?[]:applications;
    if(params.has('id'))return Response.json({applications:source.filter(a=>a.id===params.get('id'))});
    const query=(params.get('search')||'').toLowerCase();
    const since=params.get('range')==='today'?new Date().setHours(0,0,0,0):params.get('range')==='week'?Date.now()-7*86400_000:params.get('range')==='month'?Date.now()-30*86400_000:0;
    const rows=source.filter(a=>a.status!=='diagnostic'&&new Date(a.createdAt).getTime()>=since&&[a.job.company,a.job.title,a.job.location].join(' ').toLowerCase().includes(query));
    const view=params.get('view'),lane=params.get('lane')||'all';
    const summary={confirmed:rows.filter(a=>['confirmed','delivered'].includes(a.delivery.phase)).length,attention:rows.filter(a=>pipelineLane(a)==='attention').length,interviews:rows.filter(a=>a.userStatus==='colloquio').length,offers:rows.filter(a=>a.userStatus==='offerta').length,pending:rows.filter(a=>(lane==='all'||pipelineLane(a)===lane)&&!['confirmed','delivered','manual'].includes(a.delivery.phase)).length};
    const matching=rows.filter(a=>lane==='all'||pipelineLane(a)===lane);
    if(view==='export') {
      const offset=params.get('cursor')?matching.findIndex(a=>a.id===params.get('cursor'))+1:0;
      const chunk=matching.slice(offset,offset+50);
      window.__applicationResponseSizes.push(chunk.length);
      return Response.json({applications:chunk,nextCursor:offset+50<matching.length?chunk[chunk.length-1].id:null});
    }
    const windows=Object.fromEntries(APPLICATION_LANES.map(key=>[key,pageWindow(Number(params.get(key+'Page'))||1,3)]));
    const list=pageWindow(Number(params.get('page'))||1,view==='table'?(Number(params.get('pageSize'))||10):3);
    matching.forEach(a=>{windows[pipelineLane(a)].add(a.id);if(view!=='attention'||!['confirmed','delivered','manual'].includes(a.delivery.phase))list.add(a.id);});
    const lanes=Object.fromEntries(APPLICATION_LANES.map(key=>[key,windows[key].result().pagination]));
    const ids=view==='board'?APPLICATION_LANES.flatMap(key=>windows[key].result().ids):list.result().ids;
    const result={applications:ids.map(id=>source.find(a=>a.id===id)),lanes,pagination:list.result().pagination,total:list.result().pagination.total,summary,awaitingCount:source.filter(a=>a.status==='awaiting_consent').length};
    window.__applicationResponseSizes.push(result.applications.length);
    return Response.json(result);
  }
  if(String(url)==='/api/preferences') return Response.json({autoApplyMode:'manual',applicationService:{automaticBlocked:true,submissionsPaused:false,dailyCap:10}});
  if(String(url)==='/api/sidebar-stats') return Response.json({applicationsCount:applications.length,autoApplyToday:0,autoApplyRemaining:0});
  if(String(url).startsWith('/api/applications/') && options.method === 'PATCH') return Response.json({ok:true});
  if(String(url).startsWith('/api/inbox/replies') && !options.method) return Response.json({recipient:'recruiter@example.test',subject:'Re: Synthetic application message'});
  if(String(url)==='/api/gmail/sync') return Response.json({synced:1});
  if(!String(url).startsWith('/api/')) return window.__nativeFetch(url,options);
  return Response.json({});
};
async function main() {
 let content;
 if(location.pathname==='/dashboard') content=await DashboardPage();
 else if(location.pathname==='/inbox') content=<GmailInboxView messages={messages} gmailConnected={false} userEmail="alex@example.test" locale={window.__locale} />;
 else if(location.pathname==='/applications') content=<ApplicationsPage />;
 else if(location.pathname==='/materiali') content=<MaterialiView items={materials} total={materials.length} />;
 else content=<><AppTopbar title="Discover" /><div className="workspace-page workspace-discover"><DiscoverHeading count={window.__empty?0:jobs.length} /><JobSwiper jobs={window.__empty?[]:jobs} /></div></>;
 createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={window.__locale} messages={window.__messages}><SWRConfig value={{provider:()=>new Map(),dedupingInterval:0,shouldRetryOnError:false}}><AppShell sidebarProps={{userName:'Alex Example',userPlan:'Local fixture',isAdmin:false}}>{content}</AppShell><Toaster /></SWRConfig></NextIntlClientProvider>);
}
main();
`;
await build({ stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'}, bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:join(out,'workspace.js'),plugins:[{name:'local-boundaries',setup(b){
  b.onResolve({filter:/.*/},args=>{const path=args.path==='./company-logo-image'?'@/components/design/company-logo-image':args.path;return path in stub?{path,namespace:'fixture'}:undefined;});
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stub[args.path],loader:'tsx',resolveDir:process.cwd()}));
}}] });
execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','src/app/globals.css','-o',join(out,'base.css')],{stdio:'pipe'});
await writeFile(join(out,'index.html'),'<!doctype html><html style="--font-inter:'+fixtureFont+'"><head><style>'+fontCss+'</style><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/workspace.css"></head><body><div id="root"></div><script>window.__nativeFetch=window.fetch.bind(window)</script><script src="/workspace.js"></script></body></html>');
const server = createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=['/workspace.js','/workspace.css','/base.css'].includes(pathname)?join(out,pathname.slice(1)):pathname.startsWith('/textures/')?join(process.cwd(),'public',pathname):join(out,'index.html');
  res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.webp')?'image/webp':path.endsWith('.jpg')?'image/jpeg':'text/html; charset=utf-8');
  try {res.end(await readFile(path));} catch {res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
await writeFile(join(out,'preview-url.txt'),base);
if(process.argv.includes('--serve')) { console.log(base); await new Promise(()=>{}); }
let browser;
try {
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:"reduce"});
  const errors=[]; const external=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{if(!route.request().url().startsWith(base)){external.push(route.request().url());return route.abort();} return route.continue();});
  if (process.argv.includes('--pagination-checks')) {
    const geometry=[];
    for(const [width,height] of [[1440,900],[1366,768],[390,844]]) for(const locale of ['it','en']) {
      await page.setViewportSize({width,height});
      await page.goto(base+'/applications?pagination=1&locale='+locale);
      await page.waitForFunction(()=>document.querySelectorAll('.pipeline-card').length===12);
      await page.evaluate(()=>document.fonts.ready);
      const lanes=page.locator('.pipeline-lane');
      assert.equal(await lanes.count(),4);
      for(let i=0;i<4;i++)assert.equal(await lanes.nth(i).locator('.pipeline-card').count(),3);
      assert.match(await page.locator('.workspace-heading p').innerText(),/720/);
      const size=await page.evaluate(()=>{const main=document.querySelector('.lavorai-main');return {bodyWidth:document.documentElement.scrollWidth,bodyHeight:document.documentElement.scrollHeight,mainHeight:main.clientHeight,mainScrollHeight:main.scrollHeight};});
      if(width>1100){assert.ok(size.mainScrollHeight<=size.mainHeight+1);assert.ok(size.bodyHeight<=height+1);for(let i=0;i<4;i++){const box=await lanes.nth(i).locator('.application-pager').boundingBox();assert.ok(box.y+box.height<=height,'Lane controls remain visible');}}
      assert.ok(size.bodyWidth<=width);
      geometry.push({width,height,locale,...size});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:join(out,`applications-paginated-${locale}-${width}x${height}.png`),fullPage:false,animations:'disabled'});
      if(width===390) {
        await lanes.first().evaluate(el=>el.scrollIntoView({block:'start'}));
        await page.screenshot({path:join(out,`applications-paginated-${locale}-mobile-board.png`),fullPage:false,animations:'disabled'});
      }
      const firstBefore=await lanes.first().locator('.pipeline-card strong').allTextContents();
      const secondBefore=await lanes.nth(1).locator('.pipeline-card strong').allTextContents();
      const next=lanes.first().getByRole('button',{name:/next page|pagina successiva/});
      await page.evaluate(()=>window.__applicationDelayMs=350);
      await next.click();
      assert.equal(await next.evaluate(el=>document.activeElement===el),true,'Focus survives loading');
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.querySelector('.pipeline-lane .application-page-range')?.textContent.startsWith('4–6'));
      await page.evaluate(()=>window.__applicationDelayMs=0);
      assert.notDeepEqual(await lanes.first().locator('.pipeline-card strong').allTextContents(),firstBefore);
      assert.deepEqual(await lanes.nth(1).locator('.pipeline-card strong').allTextContents(),secondBefore);
      if(width>1100)assert.equal(await next.evaluate(el=>document.activeElement===el),true,'Pagination keeps keyboard focus');
      await lanes.first().getByRole('button',{name:/previous page|pagina precedente/}).click();
      await page.waitForFunction(()=>document.querySelector('.pipeline-lane .application-page-range')?.textContent.startsWith('1–3'));
      await page.getByRole('button',{name:locale==='en'?'Table':'Tabella',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.applications-table tbody tr').length===10);
      const tableFirst=await page.locator('.applications-table tbody tr').first().innerText();
      const tablePager=page.locator('.workspace-applications > .application-pager');
      await page.locator('.applications-table').evaluate(el=>el.scrollTop=el.scrollHeight);
      await tablePager.getByRole('button',{name:/next page|pagina successiva/}).click();
      await page.waitForFunction(()=>document.querySelector('.workspace-applications > .application-pager .application-page-range')?.textContent.startsWith('11–20'));
      assert.notEqual(await page.locator('.applications-table tbody tr').first().innerText(),tableFirst);
      assert.equal(await page.locator('.applications-table').evaluate(el=>el.scrollTop),0);
      const filter=page.getByRole('textbox',{name:locale==='en'?'Filter applications':'Filtra candidature'});
      await filter.fill('#719');
      await page.waitForFunction(()=>document.querySelectorAll('.applications-table tbody tr').length===1);
      assert.match(await tablePager.innerText(),/1–1/);
      assert.match(await page.locator('.applications-table tbody').innerText(),/#719/);
      await filter.fill('no matching role at all');
      await page.waitForFunction(()=>document.querySelector('.workspace-applications > .workspace-empty')?.textContent.match(/Nessun risultato|No results/));
      await filter.fill('');
      await page.waitForFunction(()=>document.querySelector('.workspace-heading p')?.textContent.includes('720'));
      await page.getByRole('combobox',{name:locale==='en'?'Application stage':'Fase candidatura'}).selectOption('outcome');
      await page.waitForFunction(()=>document.querySelector('.workspace-heading p')?.textContent.includes('120'));
      assert.match(await tablePager.innerText(),/1–10/);
      await page.getByRole('combobox',{name:locale==='en'?'Application stage':'Fase candidatura'}).selectOption('all');
      await page.waitForFunction(()=>document.querySelector('.workspace-heading p')?.textContent.includes('720'));
      await page.locator('.applications-attention summary').click();
      await page.waitForFunction(()=>document.querySelectorAll('.applications-attention-list > div').length===3);
      const pending=page.locator('.applications-attention .application-pager');
      await pending.getByRole('button',{name:/next page|pagina successiva/}).click();
      await page.waitForFunction(()=>document.querySelector('.applications-attention .application-page-range')?.textContent.startsWith('4–6'));
      if(width>1100)assert.ok(await page.locator('.lavorai-main').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Expanded pending remains within desktop');
      await page.locator('.applications-attention summary').click();
      assert.ok(await page.evaluate(()=>window.__applicationResponseSizes.every(size=>size<=12)),'No list response includes full history');
      if(width===1366 && locale==='en') {
        const downloadPromise=page.waitForEvent('download');
        await page.getByRole('button',{name:'Export CSV',exact:true}).click();
        const download=await downloadPromise;
        const csv=await readFile(await download.path(),'utf8');
        assert.equal(csv.trim().split('\n').length,721,'CSV exports all matching records in bounded batches');
        assert.ok(await page.evaluate(()=>window.__applicationResponseSizes.every(size=>size<=50)));
      }
      assert.ok(await page.evaluate(()=>window.__requests.every(r=>!r.method||r.method==='GET')),'No writes or submissions');
    }
    await page.setViewportSize({width:1366,height:768});
    await page.goto(base+'/applications?pagination=1&locale=en&id=page-0700');
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('dialog').innerText(),/#700/,'Deep link opens a record outside loaded page');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Table',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.applications-table tbody tr').length===10);
    await page.evaluate(()=>window.__failNextApplications=true);
    await page.locator('.workspace-applications > .application-pager').getByRole('button',{name:/next page/}).click();
    await page.getByRole('alert').filter({hasText:'Unable to load applications'}).waitFor();
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.workspace-applications > .application-pager .application-page-range')?.textContent.startsWith('11–20'));
    await page.screenshot({path:join(out,'applications-paginated-table-1366x768.png'),fullPage:false});
    await page.evaluate(()=>window.__removeApplications=true);
    await page.locator('.workspace-applications > .application-pager').getByRole('button',{name:/next page/}).click();
    await page.waitForFunction(()=>document.querySelector('.workspace-heading p')?.textContent.startsWith('0 '));
    assert.match(await page.locator('.workspace-applications > .application-pager').innerText(),/0–0/);
    await page.screenshot({path:join(out,'applications-paginated-empty-1366x768.png'),fullPage:false});
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await writeFile(join(out,'pagination-qa.json'),JSON.stringify({passed:true,records:720,geometry,errors,external,font:fixtureFont},null,2));
    console.log('PASS: 720 applications, 3 cards per stage, 10 table rows, independent lane pages, page reset on filters, pending pages, deep links, error recovery, last-page deletion, Italian/English 1440/1366/mobile and visible desktop controls. No external requests or writes.');
  } else
  if (process.argv.includes('--reference-captures')) {
    const geometry = [];
    for (const [width,height] of [[1440,900],[1366,768],[390,844]]) {
      await page.setViewportSize({width,height});
      for (const name of (process.env.WORKSPACE_CAPTURE_ROUTES || 'dashboard,discover,inbox,applications,materiali').split(',')) for (const locale of ['it','en']) {
        await page.goto(base+'/'+name+'?locale='+locale);
        await page.locator('.lavorai-main h1').waitFor();
        await page.evaluate(()=>document.fonts.ready);
        if(name==='materiali') await page.locator('.mat-cv-paper').waitFor();
        if(name==='applications') await page.locator('.pipeline-card').first().waitFor();
        if(name==='dashboard') await page.locator('.dg-globe canvas').waitFor();
        await page.mouse.move(0,0);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const sizes = await page.evaluate(()=>{const main=document.querySelector('.lavorai-main');return {bodyHeight:document.documentElement.scrollHeight,bodyWidth:document.documentElement.scrollWidth,mainHeight:main.clientHeight,mainScrollHeight:main.scrollHeight,panels:Object.fromEntries(['.pipeline-board','.mat-preview','.dashboard-overview','.discover-deck','.mail-reader'].map(selector=>[selector,document.querySelector(selector)?.getBoundingClientRect().top ?? null]))};});
        geometry.push({name,locale,width,height,...sizes});
        if (process.argv.includes('--assert-fit') && width > 1100) { assert.ok(sizes.bodyHeight <= height + 1, name+' body vertical overflow'); assert.ok(sizes.mainScrollHeight <= sizes.mainHeight + 1, name+' main vertical overflow'); assert.ok(sizes.bodyWidth <= width, name+' horizontal overflow'); }
        await page.screenshot({path:join(out,`${name}-${locale}-${width}x${height}.png`),fullPage:false,animations:'disabled'});
      }
    }
    if (process.argv.includes('--assert-fit')) {
      await page.setViewportSize({width:1366,height:768});
      for(const variant of ['dense','empty']) for(const name of (process.env.WORKSPACE_CAPTURE_ROUTES || 'dashboard,discover,inbox,applications,materiali').split(',')) {
        await page.goto(base+'/'+name+'?locale=en&'+variant+'=1');
        await page.locator('.lavorai-main h1').waitFor();
        await page.evaluate(()=>document.fonts.ready);
        if(name==='applications' && variant==='dense') await page.locator('.pipeline-card').first().waitFor();
        if(name==='materiali' && variant==='dense') await page.locator('.mat-cv-paper').waitFor();
        if(name==='dashboard') await page.locator('.dg-globe canvas').waitFor();
        const sizes=await page.evaluate(()=>{const main=document.querySelector('.lavorai-main');return {bodyHeight:document.documentElement.scrollHeight,bodyWidth:document.documentElement.scrollWidth,mainHeight:main.clientHeight,mainScrollHeight:main.scrollHeight,panels:Object.fromEntries(['.pipeline-board','.mat-preview','.dashboard-overview','.discover-deck','.mail-reader'].map(selector=>[selector,document.querySelector(selector)?.getBoundingClientRect().top ?? null]))};});
        assert.ok(sizes.bodyHeight<=768 && sizes.bodyWidth<=1366 && sizes.mainScrollHeight<=sizes.mainHeight+1,name+' '+variant+' viewport fit');
        geometry.push({name,variant,width:1366,height:768,...sizes});
        if(name==='dashboard' && variant==='empty') {
          assert.ok(await page.locator('.dg-empty').evaluate(el=>{const outer=el.closest('.dg-hero').getBoundingClientRect(); const bounds=el.getBoundingClientRect(); const cta=el.querySelector('a').getBoundingClientRect();return bounds.left>=outer.left && bounds.right<=outer.right && cta.top>=outer.top && cta.bottom<=outer.bottom;}),'Empty globe message and preferences action remain inside the map');
        }
        if(name==='applications' && variant==='dense') {
          await page.locator('.applications-attention summary').click();
          assert.ok(await page.locator('.applications-attention-list').evaluate(el=>el.scrollHeight>el.clientHeight),'Attention records have bounded scrolling');
          assert.ok(await page.locator('.lavorai-main').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Expanded attention keeps the page in the viewport');
          await page.locator('.applications-attention summary').click();
          assert.ok(await page.locator('.pipeline-lane-list').first().locator('.pipeline-card').count()<=3,'Dense pipeline is paginated');
        }
        if(name==='inbox' && variant==='dense') {
          assert.ok(await page.locator('.mail-message-list').evaluate(el=>el.scrollHeight>el.clientHeight));
          assert.ok(await page.locator('.mail-conversation').evaluate(el=>el.scrollHeight>el.clientHeight));
        }
        if(name==='materiali' && variant==='dense') {
          assert.ok(await page.locator('.mat-list-scroll').evaluate(el=>el.scrollHeight>el.clientHeight));
          assert.ok(await page.locator('.mat-preview').evaluate(el=>el.scrollHeight>el.clientHeight));
        }
        await page.screenshot({path:join(out,name+'-'+variant+'-1366x768.png'),fullPage:false,animations:'disabled'});
      }
      assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
    }
    await writeFile(join(out,'geometry.json'),JSON.stringify({geometry,errors,external,font:fixtureFont},null,2));
    console.log(JSON.stringify({captures:geometry.length,errors,external,geometry},null,2));
  } else {
  for(const route of ['dashboard','discover','inbox','applications','materiali']) {
    for(const locale of ['it','en']) {
      await page.goto(base+'/'+route+'?locale='+locale);
      await page.locator('.lavorai-main h1').waitFor();
        await page.evaluate(()=>document.fonts.ready);
      if(route==='materiali') await page.locator('.mat-cv-paper').waitFor();
      if(route==='applications') await page.locator('.pipeline-card').first().waitFor();
      if(route==='dashboard') { await page.locator('.dg-globe canvas').waitFor(); if(locale==='en') await page.getByText('Automatic submissions are paused.',{exact:false}).waitFor(); }
      await page.mouse.move(0,0);
      await page.screenshot({path:join(out,route+'-'+locale+'-desktop.png'),fullPage:false,animations:'disabled'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' desktop overflow');
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({path:join(out,route+'-'+locale+'-mobile.png'),fullPage:false,animations:'disabled'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' mobile overflow');
      await page.locator('.lavorai-main').evaluate(el=>{el.scrollTop=el.scrollHeight});
      await page.screenshot({path:join(out,route+'-'+locale+'-mobile-bottom.png'),fullPage:false,animations:'disabled'});
      if(route==='applications' && locale==='en') {
        await page.locator('.pipeline-board').evaluate(el=>{ const main=el.closest('.lavorai-main'); main.scrollTop += el.getBoundingClientRect().top - 66; });
        await page.screenshot({path:join(out,'applications-en-mobile-board.png'),fullPage:false,animations:'disabled'});
      }
      await page.setViewportSize({width:1440,height:1000});
    }
  }
  for(const locale of ['en','it']) {
    await page.goto(base+'/dashboard?locale='+locale+'&globeLabels=1');
    await page.locator('.dg-globe canvas').waitFor();
    const kinds=locale==='en' ? [['Opportunity','Apply'],['Submitted','View application'],['Preferred','Search here'],['Saved','Approve and submit']] : [['Opportunità','Invia candidatura'],['Inviata','Vedi candidatura'],['Desiderata','Cerca qui'],['Salvata','Approva e invia']];
    for(let index=0;index<kinds.length;index++) {
      const [label]=kinds[index];
      await page.locator('.dg-filters [role=tab]').nth(index+1).click();
      await page.waitForFunction(expected => document.querySelector('.dg-globe .dg-pin-body')?.getAttribute('aria-label')?.endsWith(expected.toLowerCase()),label);
      await page.locator('.dg-globe .dg-pin-body').first().focus();
      await page.keyboard.press('Enter');
      const sheet=page.locator('.dg-sheet');
      await sheet.waitFor();
      assert.equal(await sheet.locator('.dg-sheet-row').count(),1,'Filtered map sheet has the selected record');
      assert.ok((await sheet.textContent()).includes(['Senior React Engineer','Product Designer','Platform Engineer','Frontend Developer'][index]));
      assert.ok(await sheet.evaluate(el=>el.contains(document.activeElement)),'Map sheet receives keyboard focus');
      assert.equal(await page.locator('.dg-map-content').evaluate(el=>el.inert),true,'Covered map controls are inert');
      await page.keyboard.press('Escape');
      assert.equal(await sheet.count(),0,'Escape dismisses map sheet');
      assert.ok(await page.locator('.dg-filters [aria-selected=true]').evaluate(el=>el===document.activeElement),'Closing map sheet restores stable focus');

    }
    const select=page.locator('.dg-region-select');
    await select.selectOption('regno-unito');
    assert.equal(await select.locator('option:checked').textContent(),locale==='en'?'United Kingdom':'Regno Unito');
    await page.goto(base+'/dashboard?locale='+locale);
    await page.locator('.dg-globe .dg-pin-body').first().waitFor({state:'attached'});
    await page.locator('.dg-globe .dg-pin-body').first().evaluate(el=>el.click());
    await page.locator('.dg-sheet').waitFor();
    assert.equal(await page.locator('.dg-sheet-row').count(),4);
    await page.locator('.dg-sheet-close').click();
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/inbox?locale=en');
  await page.getByRole('button',{name:'Open all sections'}).click();
  await page.locator('.lavorai-sidebar-drawer').waitFor();
  assert.equal(await page.locator('.lavorai-sidebar-drawer').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Mobile navigation overflow');
  await page.screenshot({path:join(out,'sidebar-mobile.png'),fullPage:false,animations:'disabled'});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.lavorai-sidebar-drawer').count(),0);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base+'/applications?locale=en');
  await page.getByRole('button',{name:'Table',exact:true}).click();
  await page.locator('table').getByText('Interview',{exact:true}).waitFor();
  await page.locator('table').getByText('Possible interview',{exact:true}).waitFor();
  await page.locator('table tbody tr').first().focus(); await page.keyboard.press('Enter');
  await page.locator('.ds-drawer.open').waitFor();
  await page.getByText('No status reported.',{exact:true}).waitFor();
  await page.screenshot({path:join(out,'application-details.png'),fullPage:false,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile drawer overflow');
  await page.screenshot({path:join(out,'application-details-mobile.png'),fullPage:false,animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('link',{name:'Open listing',exact:true}).focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('link',{name:'View listing',exact:true}).evaluate(el=>el===document.activeElement),true,'Dialog reverse tab wraps');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('link',{name:'Open listing',exact:true}).evaluate(el=>el===document.activeElement),true,'Dialog tab wraps');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Kanban',exact:true}).click();
  await page.getByRole('textbox',{name:'Filter applications'}).fill('no matching company');
  await page.waitForFunction(()=>document.querySelectorAll('.pipeline-card').length===0);
  assert.equal(await page.locator('.pipeline-card').count(),0);
  await page.goto(base+'/applications?locale=en&empty=1');
  await page.getByText('No applications recorded yet.',{exact:false}).waitFor();
  await page.screenshot({path:join(out,'applications-empty.png'),fullPage:false,animations:'disabled'});
  await page.goto(base+'/applications?locale=en&error=1');
  await page.getByRole('alert').waitFor();
  await page.screenshot({path:join(out,'applications-error.png'),fullPage:false,animations:'disabled'});
  await page.goto(base+'/inbox?locale=en');
  await page.getByRole('button',{name:'Failed',exact:true}).click();
  assert.equal(await page.locator('[aria-label="Messages"] button').count(),1);
  assert.equal(await page.locator('[data-testid="message-body"] img, [data-testid="message-body"] script').count(),0);
  assert.ok((await page.getByRole('link',{name:'View application',exact:true}).getAttribute('href')).includes('app-2'));
  assert.equal(await page.locator('select').count(),0,'Inbox uses folder/filter controls instead of native dropdowns');
  assert.equal(await page.evaluate(()=>window.__requests.filter(r=>r.method==='POST').length),0,'Reading mail must not send email');
  await page.goto(base+'/discover?locale=en');
  await page.getByRole('button',{name:'Remote only',exact:false}).click();
  assert.equal(await page.locator('.discover-card').count(),1);
  await page.getByRole('button',{name:'Save job',exact:true}).focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.__requests.filter(r=>r.url.includes('/api/applications/apply')).length),0,'Saving with keyboard must not apply');
  await page.getByRole('button',{name:'Details',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.goto(base+'/discover?locale=en&onsite=1');
  await page.getByRole('button',{name:'Remote only',exact:false}).click();
  await page.getByRole('heading',{name:'No remote roles in this selection'}).waitFor();
  await page.getByRole('button',{name:'Show all roles',exact:true}).click();
  await page.locator('.discover-card').waitFor();
  await page.goto(base+'/materiali?locale=en');
  await page.locator('.mat-cv-paper').waitFor();
  await page.getByRole('tab',{name:'Tailored CV',exact:true}).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'Cover letter',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('textbox',{name:'Search role or company',exact:true}).fill('no such role');
  await page.getByText('No packages match your filters.',{exact:false}).waitFor();
  for(const route of ['dashboard','discover','inbox','materiali']) {
    await page.goto(base+'/'+route+'?locale=en&empty=1');
    await page.locator('.lavorai-main').waitFor();
    await page.screenshot({path:join(out,route+'-empty.png'),fullPage:false,animations:'disabled'});
  }
  await page.goto(base+'/discover?locale=en');
  await page.locator('.discover-card').waitFor();
  await page.getByRole('button',{name:'Light theme',exact:true}).first().click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.getByRole('button',{name:'Dark theme',exact:true}).first().waitFor();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.workspace-topbar')).backgroundColor==='rgb(255, 255, 255)');
  assert.equal(await page.locator('.workspace-topbar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','Light topbar must contrast with dark text');
  await page.screenshot({path:join(out,'discover-light.png'),fullPage:false,animations:'disabled'});
  assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
  console.log('PASS: five real views, Italian/English desktop/mobile, empty/error states, filters, safe email text, status update, keyboard save without application, tabs, light theme and English/Italian map sheets/status labels. No production requests.');
  await writeFile(join(out,'qa-result.json'),JSON.stringify({passed:true,errors,external,screenshots:41,base,font:fixtureFont},null,2));
  }
} finally { if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
