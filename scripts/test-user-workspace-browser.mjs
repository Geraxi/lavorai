/** Local synthetic fixtures around the real UI. No database, provider, email,
 * checkout, application submission or production request is permitted. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const out = resolve('output/playwright/user-workspace');
await mkdir(out, { recursive: true });
const stub = {
  'next/navigation': `export const usePathname = () => location.pathname; const router = { refresh() { window.__refreshes++; }, push(url) { window.__navigation = url; } }; export const useRouter = () => router; const params = new URLSearchParams(location.search); export const useSearchParams = () => params;`,
  'next/link': `import React from 'react'; export default function Link({ prefetch, ...props }) { return React.createElement('a', props); }`,
  'next/dynamic': `import React from 'react'; export default function dynamic(loader) { const Component = React.lazy(() => loader().then(component => ({default: component.default ?? component}))); return props => <React.Suspense fallback={<div>Loading map…</div>}><Component {...props} /></React.Suspense>; }`,
  'next-auth/react': `export const signOut = () => {};`,
  'next-intl/server': `export const getLocale = async () => window.__locale; export const getTranslations = async namespace => (key, values={}) => Object.entries(values).reduce((text,[name,value])=>text.replace("{"+name+"}",value),window.__messages[namespace][key] ?? key);`,
  '@/lib/session': `export const getCurrentUser = async () => ({ id: 'fixture', name: 'Alex Example', email: 'alex@example.test', welcomeSeenAt: new Date() });`,
  '@/lib/db': `export const prisma = { application: { count: async query => window.__empty ? 0 : query.where.userStatus === 'offerta' ? 1 : 2, findMany: async query => query.select.interviewSessions ? [] : [] } };`,
  '@/lib/onboarding': `export const getOnboardingState = async () => ({ hasUploadedCv: true, hasSetPreferences: true, hasFirstApplication: true });`,
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
import { JobSwiper } from './src/components/job-swiper';
import ApplicationsPage from './src/app/(app)/applications/page';
import DashboardPage from './src/app/(app)/dashboard/page';
import { MaterialiView } from './src/app/(app)/materiali/materiali-view';
import './src/app/(app)/materiali/materiali.css';
import it from './messages/it.json'; import en from './messages/en.json';
window.__locale = new URLSearchParams(location.search).get('locale') || 'it';
window.__messages = window.__locale === 'en' ? en : it;
window.__empty = new URLSearchParams(location.search).has('empty');
window.__requests = []; window.__refreshes = 0;
const now = new Date().toISOString();
const jobs = ['Senior React Engineer', 'Product Designer', 'Platform Engineer', 'Frontend Developer'].map((title,i) => ({ id:'job-'+i, title, company:['Example Studio','Sample Labs','Demo Cloud','Example Works'][i], location:['Milano, Italia','Berlin, Germany','Remote EU','London, UK'][i], description:'React TypeScript design systems and accessible interfaces. Work with the product team to build reliable customer experiences. Experience with SQL, Git and automated testing is useful. This is a local synthetic job fixture.', url:'https://example.test/jobs/'+i, contractType:'permanent', remote:new URLSearchParams(location.search).has('onsite')?false:i!==1, salaryMin:i===1?null:60000, salaryMax:i===1?null:80000, postedAt:now, matchScore:i===0?null:88-i }));
const phases = ['confirmed','accepted','pending','delivered','manual','failed'];
const labels = ['Ricevuta ATS verificata','Email accettata dal provider','Risposte necessarie','Email consegnata','Invio dichiarato da te','Non inviata'];
const applications = window.__empty ? [] : phases.map((phase,i) => ({ id:'app-'+i, status:i===2?'needs_answers':i===5?'failed':'success', portal:'greenhouse', atsScore:i===0?null:80+i, suggestions:[], createdAt:now, errorMessage:null, coverLetterText:i%2?'Dear hiring team, this is a synthetic cover letter used only for local browser verification.':null, hasCvDocx:true, hasCoverLetterDocx:i%2===1, hasCvPdf:false, cvLanguage:i%2?'en':'it', userStatus:i===3?'colloquio':i===4?'offerta':null, viewedAt:i===1?now:null, submittedVia:phase==='manual'?'manual':'portal_greenhouse', submittedAt:phase==='confirmed'?now:null, lastReplyAt:i===3?now:null, replyCount:i===3?1:0, lastReplyKind:i===3?'colloquio':null, submitConfirmation:null, delivery:{phase,label:labels[i],detail:'Stato documentato della candidatura di prova.',tone:'neutral'}, deliveryRecipient:null, job:{ ...jobs[i%4], source:'greenhouse' } }));
const messages = window.__empty ? [] : applications.slice(0,4).map((a,i)=> ({id:'application_reply:'+i, source:i===3?'gmail':'application_reply', from:'Recruiter '+i+' <recruiter@example.test>', subject:['Interview availability','Application received','Delivery failed','Role update'][i], snippet:'Thank you for your interest in this position.', bodyText:'Hello Alex,\\n\\nThank you for your interest. Can we arrange a conversation next week?\\n\\nThis is a synthetic message for browser QA.\\n<img src="https://tracker.invalid/pixel"><script>alert(1)</script>', date:now, kind:['colloquio','ricevuta','bounce','risposta'][i], label:['Possible interview','Application receipt','Delivery failure','Possible recruiter reply'][i], read:i===3?false:null, applicationId:a.id, applicationStatus:a.userStatus, company:a.job.company, jobTitle:a.job.title, jobRelated:true}));
const materials = applications.map(a => ({id:a.id,title:a.job.title,company:a.job.company,location:a.job.location,jobUrl:a.job.url,createdAt:a.createdAt,completedAt:null,status:a.status,submittedVia:a.submittedVia,delivery:a.delivery,hasPdf:false,hasDocx:true,hasLetter:a.hasCoverLetterDocx,letterText:a.coverLetterText,language:a.cvLanguage,match:a.atsScore,lastReplyAt:a.lastReplyAt,lastReplyKind:a.lastReplyKind}));
window.__globe = { markers: window.__empty ? [] : [{ key:'milan', name:'Milano', country:'IT', lat:45.46,lng:9.19,counts:{open:4,sent:0,desired:0,saved:0},jobs:jobs.map(j=>({...j,href:'/jobs/'+j.id,match:j.matchScore,kind:'open',isNew:false})),isNew:false}], stats:{analyzed:window.__empty?0:4,compatible:window.__empty?0:4,newOpportunities:0,counts:{open:window.__empty?0:4,sent:0,desired:0,saved:0}}, featuredKeys:[] };
window.fetch = async (url, options={}) => {
  window.__requests.push({url:String(url),method:options.method||'GET',body:options.body});
  if(String(url).includes('/api/applications/apply')) return new Response(JSON.stringify({message:'Synthetic blocked submission'}),{status:403});
  if(String(url).includes('/cv-preview')) return Response.json({text:'Alex Example\\nFrontend Engineer\\n\\nSUMMARY\\nSynthetic CV document for local testing.\\n\\nEXPERIENCE\\nExample Studio — Frontend Engineer\\nBuilt accessible web interfaces with React and TypeScript.\\n\\nSKILLS\\nReact · TypeScript · SQL · Testing'});
  if(String(url).startsWith('/api/applications?')) {
    if(new URLSearchParams(location.search).has('error')) return new Response('{}',{status:503});
    return Response.json({applications});
  }
  if(String(url)==='/api/preferences') return Response.json({autoApplyMode:'manual',applicationService:{automaticBlocked:true,submissionsPaused:false,dailyCap:10}});
  if(String(url)==='/api/sidebar-stats') return Response.json({applicationsCount:applications.length,autoApplyToday:0,autoApplyRemaining:0});
  if(String(url).startsWith('/api/applications/') && options.method === 'PATCH') return Response.json({ok:true});
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
 else content=<><AppTopbar title="Discover" /><div className="workspace-page"><header className="workspace-heading"><div><div className="workspace-eyebrow">Discover</div><h1>{window.__locale==='en'?'Your next opportunity':'La tua prossima opportunità'}</h1></div></header><JobSwiper jobs={window.__empty?[]:jobs} /></div></>;
 createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={window.__locale} messages={window.__messages}><SWRConfig value={{provider:()=>new Map(),dedupingInterval:0,shouldRetryOnError:false}}><AppShell sidebarProps={{userName:'Alex Example',userPlan:'Local fixture',isAdmin:false}}>{content}</AppShell><Toaster /></SWRConfig></NextIntlClientProvider>);
}
main();
`;
await build({ stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'}, bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:join(out,'workspace.js'),plugins:[{name:'local-boundaries',setup(b){
  b.onResolve({filter:/.*/},args=>{const path=args.path==='./company-logo-image'?'@/components/design/company-logo-image':args.path;return path in stub?{path,namespace:'fixture'}:undefined;});
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stub[args.path],loader:'tsx',resolveDir:process.cwd()}));
}}] });
execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','src/app/globals.css','-o',join(out,'base.css')],{stdio:'pipe'});
await writeFile(join(out,'index.html'),'<!doctype html><html style="--font-inter:Arial"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/workspace.css"></head><body><div id="root"></div><script>window.__nativeFetch=window.fetch.bind(window)</script><script src="/workspace.js"></script></body></html>');
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
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; const external=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{if(!route.request().url().startsWith(base)){external.push(route.request().url());return route.abort();} return route.continue();});
  for(const route of ['dashboard','discover','inbox','applications','materiali']) {
    for(const locale of ['it','en']) {
      await page.goto(base+'/'+route+'?locale='+locale);
      await page.locator('.lavorai-main h1').waitFor();
      if(route==='materiali') await page.locator('.mat-cv-paper').waitFor();
      if(route==='applications') await page.locator('.pipeline-card').first().waitFor();
      if(route==='dashboard') { await page.locator('.dg-globe canvas').waitFor(); if(locale==='en') await page.getByText('Automatic submissions are paused.',{exact:false}).waitFor(); }
      await page.mouse.move(0,0);
      await page.screenshot({path:join(out,route+'-'+locale+'-desktop.png'),fullPage:true,animations:'disabled'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' desktop overflow');
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:join(out,route+'-'+locale+'-mobile.png'),fullPage:true,animations:'disabled'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' mobile overflow');
      await page.locator('.lavorai-main').evaluate(el=>{el.scrollTop=el.scrollHeight});
      await page.screenshot({path:join(out,route+'-'+locale+'-mobile-bottom.png'),fullPage:true,animations:'disabled'});
      await page.setViewportSize({width:1440,height:1000});
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/inbox?locale=en');
  await page.getByRole('button',{name:'Open all sections'}).click();
  await page.locator('.lavorai-sidebar-drawer').waitFor();
  assert.equal(await page.locator('.lavorai-sidebar-drawer').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Mobile navigation overflow');
  await page.screenshot({path:join(out,'sidebar-mobile.png'),fullPage:true,animations:'disabled'});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.lavorai-sidebar-drawer').count(),0);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base+'/applications?locale=en');
  await page.getByRole('button',{name:'Table',exact:true}).click();
  await page.locator('table tbody tr').first().focus(); await page.keyboard.press('Enter');
  await page.locator('.ds-drawer.open').waitFor();
  await page.getByText('No status reported.',{exact:true}).waitFor();
  await page.screenshot({path:join(out,'application-details.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile drawer overflow');
  await page.screenshot({path:join(out,'application-details-mobile.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('link',{name:'Open listing',exact:true}).focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('link',{name:'View listing',exact:true}).evaluate(el=>el===document.activeElement),true,'Dialog reverse tab wraps');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('link',{name:'Open listing',exact:true}).evaluate(el=>el===document.activeElement),true,'Dialog tab wraps');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Kanban',exact:true}).click();
  await page.getByRole('textbox',{name:'Filter applications'}).fill('no matching company');
  assert.equal(await page.locator('.pipeline-card').count(),0);
  await page.goto(base+'/applications?locale=en&empty=1');
  await page.getByText('No applications recorded yet.',{exact:false}).waitFor();
  await page.screenshot({path:join(out,'applications-empty.png'),fullPage:true,animations:'disabled'});
  await page.goto(base+'/applications?locale=en&error=1');
  await page.getByRole('alert').waitFor();
  await page.screenshot({path:join(out,'applications-error.png'),fullPage:true,animations:'disabled'});
  await page.goto(base+'/inbox?locale=en');
  await page.getByLabel('Message type',{exact:true}).selectOption('bounce');
  assert.equal(await page.locator('[aria-label="Messages"] button').count(),1);
  assert.equal(await page.locator('[data-testid="message-body"] img, [data-testid="message-body"] script').count(),0);
  await page.getByLabel('Manual application status',{exact:true}).selectOption('offerta');
  await page.getByText('Application status updated.',{exact:true}).waitFor();
  const request=await page.evaluate(()=>window.__requests.find(r=>r.method==='PATCH'));
  assert.equal(request.url,'/api/applications/app-2'); assert.deepEqual(JSON.parse(request.body),{userStatus:'offerta'});
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
    await page.screenshot({path:join(out,route+'-empty.png'),fullPage:true,animations:'disabled'});
  }
  await page.goto(base+'/discover?locale=en');
  await page.locator('.discover-card').waitFor();
  await page.getByRole('button',{name:'Light theme',exact:true}).first().click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.getByRole('button',{name:'Dark theme',exact:true}).first().waitFor();
  assert.equal(await page.locator('.workspace-topbar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','Light topbar must contrast with dark text');
  await page.screenshot({path:join(out,'discover-light.png'),fullPage:true,animations:'disabled'});
  assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
  console.log('PASS: five real views, Italian/English desktop/mobile, empty/error states, filters, safe email text, status update, keyboard save without application, tabs and light theme. No production requests.');
  await writeFile(join(out,'qa-result.json'),JSON.stringify({passed:true,errors,external,screenshots:40,base},null,2));
} finally { if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
